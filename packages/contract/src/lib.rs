#![no_std]
//! Fixed-denomination shielded pool.
//!
//! A deposit transfers exactly `denomination` of one token into the contract
//! and appends a commitment to a Poseidon Merkle tree. A withdrawal presents a
//! Groth16 proof of knowing an unspent commitment, without revealing which.
//! Because all deposits are equal, amounts do not link the two.
//!
//! There is no admin: the token, denomination and verification key are fixed
//! at deployment.

use soroban_poseidon::{poseidon_hash, Field};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    panic_with_error, token, vec,
    xdr::ToXdr,
    Address, BytesN, Env, Vec, U256,
};

pub const LEVELS: u32 = 20;
/// Recent roots that stay valid, so deposits do not invalidate pending proofs.
pub const ROOT_HISTORY: u32 = 100;
/// Most leaves returned by one `leaves` call.
pub const MAX_PAGE: u32 = 100;

const DAY: u32 = 17280; // ledgers
const TTL_THRESHOLD: u32 = 30 * DAY;
const TTL_EXTEND: u32 = 90 * DAY;

/// A Groth16 proof. G1 points are `X || Y`; G2 coordinates are `c1 || c0`.
#[contracttype]
#[derive(Clone)]
pub struct Groth16Proof {
    pub a: BytesN<64>,
    pub b: BytesN<128>,
    pub c: BytesN<64>,
}

/// Verification key for the public inputs `[nullifier, root, recipient]`.
#[contracttype]
#[derive(Clone)]
pub struct Groth16VKey {
    pub alpha_g1: BytesN<64>,
    pub beta_g2: BytesN<128>,
    pub gamma_g2: BytesN<128>,
    pub delta_g2: BytesN<128>,
    pub ic: Vec<BytesN<64>>,
}

#[contracttype]
#[derive(Clone)]
pub struct PoolInfo {
    pub token: Address,
    pub denomination: i128,
    pub next_index: u32,
    pub root: BytesN<32>,
}

#[contracttype]
#[derive(Clone)]
struct Config {
    token: Address,
    denomination: i128,
}

/// Incremental Merkle tree: `frontier[i]` is the last left node at level `i`.
#[contracttype]
#[derive(Clone)]
struct Tree {
    next_index: u32,
    frontier: Vec<U256>,
    zeros: Vec<U256>,
    roots: Vec<BytesN<32>>,
}

#[contracttype]
enum Key {
    Config,
    VKey,
    Tree,
    Leaf(u32),
    Commitment(BytesN<32>),
    Nullifier(BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    InvalidDenomination = 1,
    InvalidVerificationKey = 2,
    NotAFieldElement = 3,
    DuplicateCommitment = 4,
    TreeFull = 5,
    UnknownRoot = 6,
    NullifierSpent = 7,
    InvalidProof = 8,
    InvalidFee = 9,
}

#[contractevent]
pub struct Deposit {
    #[topic]
    pub commitment: BytesN<32>,
    pub index: u32,
}

#[contractevent]
pub struct Withdrawal {
    #[topic]
    pub nullifier: BytesN<32>,
    pub recipient: Address,
    pub relayer: Address,
    pub fee: i128,
}

#[contract]
pub struct ShieldedPool;

#[contractimpl]
impl ShieldedPool {
    pub fn __constructor(env: Env, token: Address, denomination: i128, vkey: Groth16VKey) {
        if denomination <= 0 {
            panic_with_error!(&env, Error::InvalidDenomination);
        }
        if vkey.ic.len() != 4 {
            panic_with_error!(&env, Error::InvalidVerificationKey);
        }
        let mut zeros = Vec::new(&env);
        let mut node = U256::from_u32(&env, 0);
        for _ in 0..LEVELS {
            zeros.push_back(node.clone());
            node = hash(&env, node.clone(), node);
        }
        let store = env.storage().instance();
        store.set(&Key::Config, &Config { token, denomination });
        store.set(&Key::VKey, &vkey);
        store.set(
            &Key::Tree,
            &Tree {
                next_index: 0,
                frontier: zeros.clone(),
                zeros,
                roots: vec![&env, to_bytes(node)],
            },
        );
    }

    /// Transfers one denomination from `from` and appends `commitment`.
    /// Returns the leaf index.
    pub fn deposit(env: Env, from: Address, commitment: BytesN<32>) -> u32 {
        from.require_auth();
        require_canonical(&env, &commitment);
        let key = Key::Commitment(commitment.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::DuplicateCommitment);
        }

        let mut tree = load_tree(&env);
        let index = tree.next_index;
        if index >= 1 << LEVELS {
            panic_with_error!(&env, Error::TreeFull);
        }
        let mut node = U256::from_be_bytes(&env, commitment.as_ref());
        let mut position = index;
        for level in 0..LEVELS {
            node = if position % 2 == 0 {
                tree.frontier.set(level, node.clone());
                hash(&env, node, tree.zeros.get_unchecked(level))
            } else {
                hash(&env, tree.frontier.get_unchecked(level), node)
            };
            position /= 2;
        }
        tree.next_index += 1;
        tree.roots.push_back(to_bytes(node));
        if tree.roots.len() > ROOT_HISTORY {
            tree.roots.pop_front();
        }
        env.storage().instance().set(&Key::Tree, &tree);
        persist(&env, &key, &true);
        persist(&env, &Key::Leaf(index), &commitment);
        bump(&env);

        let config = load_config(&env);
        token::TokenClient::new(&env, &config.token).transfer(
            &from,
            &env.current_contract_address(),
            &config.denomination,
        );
        Deposit { commitment, index }.publish(&env);
        index
    }

    /// Pays `recipient` one denomination less `fee`, which goes to `relayer`.
    /// Needs no authorization: the proof is bound to all three, so any account
    /// may submit it but cannot change who is paid.
    pub fn withdraw(
        env: Env,
        proof: Groth16Proof,
        root: BytesN<32>,
        nullifier: BytesN<32>,
        recipient: Address,
        relayer: Address,
        fee: i128,
    ) {
        let config = load_config(&env);
        if fee < 0 || fee > config.denomination {
            panic_with_error!(&env, Error::InvalidFee);
        }
        // A non-canonical encoding would be a second spelling of one nullifier.
        require_canonical(&env, &nullifier);
        let key = Key::Nullifier(nullifier.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::NullifierSpent);
        }
        if !load_tree(&env).roots.contains(&root) {
            panic_with_error!(&env, Error::UnknownRoot);
        }
        let inputs = vec![
            &env,
            nullifier.clone(),
            root,
            payout_field(&env, &recipient, &relayer, fee),
        ];
        if !verify(&env, proof, inputs) {
            panic_with_error!(&env, Error::InvalidProof);
        }
        persist(&env, &key, &true);
        bump(&env);

        let pool = env.current_contract_address();
        let token = token::TokenClient::new(&env, &config.token);
        if fee < config.denomination {
            token.transfer(&pool, &recipient, &(config.denomination - fee));
        }
        if fee > 0 {
            token.transfer(&pool, &relayer, &fee);
        }
        Withdrawal { nullifier, recipient, relayer, fee }.publish(&env);
    }

    pub fn pool_info(env: Env) -> PoolInfo {
        let config = load_config(&env);
        let tree = load_tree(&env);
        PoolInfo {
            token: config.token,
            denomination: config.denomination,
            next_index: tree.next_index,
            root: tree.roots.last_unchecked(),
        }
    }

    /// Commitments from `start`, at most `MAX_PAGE`, to rebuild the tree.
    pub fn leaves(env: Env, start: u32) -> Vec<BytesN<32>> {
        let end = load_tree(&env).next_index.min(start.saturating_add(MAX_PAGE));
        let mut page = Vec::new(&env);
        for index in start..end {
            page.push_back(env.storage().persistent().get(&Key::Leaf(index)).unwrap());
        }
        page
    }

    pub fn is_nullifier_spent(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage().persistent().has(&Key::Nullifier(nullifier))
    }
}

fn load_config(env: &Env) -> Config {
    env.storage().instance().get(&Key::Config).unwrap()
}

fn load_tree(env: &Env) -> Tree {
    env.storage().instance().get(&Key::Tree).unwrap()
}

fn persist<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &Key, value: &V) {
    let store = env.storage().persistent();
    store.set(key, value);
    store.extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND);
}

fn bump(env: &Env) {
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
}

/// circomlib's `Poseidon(2)`.
fn hash(env: &Env, left: U256, right: U256) -> U256 {
    poseidon_hash::<3, Bn254Fr>(env, &vec![env, left, right])
}

fn to_bytes(value: U256) -> BytesN<32> {
    value.to_be_bytes().try_into().unwrap()
}

fn require_canonical(env: &Env, value: &BytesN<32>) {
    if U256::from_be_bytes(env, value.as_ref()) >= Bn254Fr::modulus(env) {
        panic_with_error!(env, Error::NotAFieldElement);
    }
}

/// sha256 of the recipient, relayer and fee XDR with the top byte cleared, so
/// it fits the field. Bound into the proof as its `recipient` input.
fn payout_field(env: &Env, recipient: &Address, relayer: &Address, fee: i128) -> BytesN<32> {
    let mut data = recipient.to_xdr(env);
    data.append(&relayer.to_xdr(env));
    data.append(&fee.to_xdr(env));
    let mut bytes = env.crypto().sha256(&data).to_array();
    bytes[0] = 0;
    BytesN::from_array(env, &bytes)
}

/// Checks `e(A, B) == e(alpha, beta) · e(L, gamma) · e(C, delta)` where
/// `L = IC[0] + Σ x_i · IC[i + 1]`.
fn verify(env: &Env, proof: Groth16Proof, inputs: Vec<BytesN<32>>) -> bool {
    let vkey: Groth16VKey = env.storage().instance().get(&Key::VKey).unwrap();
    let bn254 = env.crypto().bn254();
    let mut acc = Bn254G1Affine::from_bytes(vkey.ic.get_unchecked(0));
    for (i, input) in inputs.iter().enumerate() {
        let point = Bn254G1Affine::from_bytes(vkey.ic.get_unchecked(i as u32 + 1));
        acc = bn254.g1_add(&acc, &bn254.g1_mul(&point, &Bn254Fr::from_bytes(input)));
    }
    bn254.pairing_check(
        vec![
            env,
            Bn254G1Affine::from_bytes(proof.a),
            -acc,
            -Bn254G1Affine::from_bytes(proof.c),
            -Bn254G1Affine::from_bytes(vkey.alpha_g1),
        ],
        vec![
            env,
            Bn254G2Affine::from_bytes(proof.b),
            Bn254G2Affine::from_bytes(vkey.gamma_g2),
            Bn254G2Affine::from_bytes(vkey.delta_g2),
            Bn254G2Affine::from_bytes(vkey.beta_g2),
        ],
    )
}

#[cfg(test)]
mod fixture;
#[cfg(test)]
mod test;
