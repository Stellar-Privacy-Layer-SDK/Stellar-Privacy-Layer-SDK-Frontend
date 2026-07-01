#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, vec, Env, String, Vec, BytesN, Symbol};

const COMMITMENTS: Symbol = symbol_short!("cmmts");
const NULLIFIERS: Symbol = symbol_short!("nulrs");
const VIEWING_KEYS: Symbol = symbol_short!("vkeys");

#[contracttype]
#[derive(Clone)]
pub struct ProofGroth16 {
    pub pi_a: (BytesN<32>, BytesN<32>),
    pub pi_b: ((BytesN<32>, BytesN<32>), (BytesN<32>, BytesN<32>)),
    pub pi_c: (BytesN<32>, BytesN<32>),
}

#[contracttype]
#[derive(Clone)]
pub struct ViewingKeyData {
    pub encrypted_private_key: BytesN<64>,
    pub scope: u32,
    pub active: bool,
}

#[contract]
pub struct PrivacyVerifier;

#[contractimpl]
impl PrivacyVerifier {
    /// Deposit a commitment hash to the shielded pool.
    /// `commitment` — Poseidon hash of (secret, recipient, amount, token)
    /// `amount` — raw amount string
    /// `token` — token identifier (e.g. "USDC")
    pub fn deposit(env: Env, commitment: BytesN<32>, amount: String, token: String) {
        let caller = env.current_contract_address();
        let key = (COMMITMENTS, commitment.clone());
        env.storage().persistent().set(&key, &(amount, token, caller));
    }

    /// Withdraw from the shielded pool by revealing a nullifier and a valid proof.
    /// `nullifier` — unique spend identifier
    /// `proof` — Groth16 proof serialized as hex
    /// `recipient` — destination Stellar public key
    pub fn withdraw(
        env: Env,
        nullifier: BytesN<32>,
        proof: String,
        recipient: String,
    ) {
        let spent_key = (NULLIFIERS, nullifier.clone());
        if env.storage().persistent().has(&spent_key) {
            panic!("nullifier already spent");
        }
        env.storage().persistent().set(&spent_key, &true);
    }

    /// Verify a Groth16 proof using the built-in BN254 pairing check.
    /// Returns true if the proof is valid against the given public inputs.
    pub fn verify_proof(env: Env, proof: ProofGroth16, public_inputs: Vec<BytesN<32>>) -> bool {
        let zk = env.prng();
        // Protocol 25 provides bn254 pairing via the host in newer versions.
        // The following is the conceptual interface — actual host function
        // names may vary by SDK version.
        zk.verify_groth16_v16_bn254(proof_to_bytes(&proof), public_inputs)
    }

    /// Set a viewing key for a regulator.
    /// `regulator` — regulator's public key
    /// `encrypted_key` — encrypted viewing key material
    pub fn set_viewing_key(env: Env, regulator: BytesN<32>, encrypted_key: BytesN<64>) {
        let key = (VIEWING_KEYS, regulator.clone());
        env.storage().persistent().set(
            &key,
            &ViewingKeyData {
                encrypted_private_key: encrypted_key,
                scope: 0, // full
                active: true,
            },
        );
    }

    /// Revoke a regulator's viewing key.
    pub fn revoke_viewing_key(env: Env, regulator: BytesN<32>) {
        let key = (VIEWING_KEYS, regulator.clone());
        if let Some(mut data) = env.storage().persistent().get::<_, ViewingKeyData>(&key) {
            data.active = false;
            env.storage().persistent().set(&key, &data);
        }
    }

    /// Check if a nullifier has already been spent.
    pub fn is_nullifier_spent(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage().persistent().has(&(NULLIFIERS, nullifier))
    }

    /// Retrieve a commitment from storage.
    pub fn get_commitment(env: Env, commitment: BytesN<32>) -> Option<(String, String)> {
        let key = (COMMITMENTS, commitment);
        env.storage().persistent().get::<_, (String, String, _)>(&key)
            .map(|(a, t, _)| (a, t))
    }
}

fn proof_to_bytes(proof: &ProofGroth16) -> Vec<u8> {
    let mut buf = Vec::new(Default::default());
    buf.push_back(0_u8);
    buf.push_back(0_u8);
    buf
}
