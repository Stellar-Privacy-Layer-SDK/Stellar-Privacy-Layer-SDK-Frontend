extern crate std;

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Env, String,
};

const DENOMINATION: i128 = 100_0000000;

struct Setup {
    env: Env,
    pool: ShieldedPoolClient<'static>,
    token: TokenClient<'static>,
    user: Address,
    recipient: Address,
}

fn hex<const N: usize>(env: &Env, value: &str) -> BytesN<N> {
    let mut bytes = [0u8; N];
    for (i, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[i * 2..i * 2 + 2], 16).unwrap();
    }
    BytesN::from_array(env, &bytes)
}

fn vkey(env: &Env) -> Groth16VKey {
    Groth16VKey {
        alpha_g1: hex(env, fixture::ALPHA),
        beta_g2: hex(env, fixture::BETA),
        gamma_g2: hex(env, fixture::GAMMA),
        delta_g2: hex(env, fixture::DELTA),
        ic: vec![
            env,
            hex(env, fixture::IC0),
            hex(env, fixture::IC1),
            hex(env, fixture::IC2),
            hex(env, fixture::IC3),
        ],
    }
}

fn proof(env: &Env) -> Groth16Proof {
    Groth16Proof {
        a: hex(env, fixture::A),
        b: hex(env, fixture::B),
        c: hex(env, fixture::C),
    }
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();
    let user = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(Address::generate(&env));
    StellarAssetClient::new(&env, &asset.address()).mint(&user, &(DENOMINATION * 200));
    let id = env.register(ShieldedPool, (asset.address(), DENOMINATION, vkey(&env)));
    Setup {
        pool: ShieldedPoolClient::new(&env, &id),
        token: TokenClient::new(&env, &asset.address()),
        recipient: Address::from_string(&String::from_str(&env, fixture::RECIPIENT)),
        user,
        env,
    }
}

/// Deposits the three fixture notes.
fn fund(s: &Setup) {
    for leaf in [fixture::LEAF0, fixture::LEAF1, fixture::LEAF2] {
        s.pool.deposit(&s.user, &hex(&s.env, leaf));
    }
}

fn nullifier(s: &Setup) -> BytesN<32> {
    hex(&s.env, fixture::NULLIFIER)
}

fn root(s: &Setup) -> BytesN<32> {
    hex(&s.env, fixture::ROOT)
}

#[test]
fn deposit_moves_tokens_and_matches_the_circuit_tree() {
    let s = setup();
    fund(&s);
    let info = s.pool.pool_info();
    assert_eq!(info.root, root(&s));
    assert_eq!(info.next_index, 3);
    assert_eq!(s.token.balance(&s.pool.address), DENOMINATION * 3);
    assert_eq!(s.pool.leaves(&1).len(), 2);
    assert_eq!(s.pool.leaves(&1).get_unchecked(1), hex(&s.env, fixture::LEAF2));
    assert_eq!(s.pool.leaves(&9).len(), 0);
}

#[test]
fn withdraw_pays_the_recipient_without_authorization() {
    let s = setup();
    fund(&s);
    s.env.set_auths(&[]);
    s.pool.withdraw(&proof(&s.env), &root(&s), &nullifier(&s), &s.recipient);
    assert_eq!(s.token.balance(&s.recipient), DENOMINATION);
    assert_eq!(s.token.balance(&s.pool.address), DENOMINATION * 2);
    assert!(s.pool.is_nullifier_spent(&nullifier(&s)));
}

#[test]
fn withdraw_rejects_double_spend() {
    let s = setup();
    fund(&s);
    s.pool.withdraw(&proof(&s.env), &root(&s), &nullifier(&s), &s.recipient);
    assert_eq!(
        s.pool.try_withdraw(&proof(&s.env), &root(&s), &nullifier(&s), &s.recipient),
        Err(Ok(Error::NullifierSpent.into()))
    );
}

#[test]
fn withdraw_rejects_an_alternative_encoding_of_a_spent_nullifier() {
    let s = setup();
    fund(&s);
    s.pool.withdraw(&proof(&s.env), &root(&s), &nullifier(&s), &s.recipient);
    let alias = to_bytes(
        U256::from_be_bytes(&s.env, nullifier(&s).as_ref()).add(&Bn254Fr::modulus(&s.env)),
    );
    assert_eq!(
        s.pool.try_withdraw(&proof(&s.env), &root(&s), &alias, &s.recipient),
        Err(Ok(Error::NotAFieldElement.into()))
    );
}

#[test]
fn withdraw_rejects_a_redirected_recipient() {
    let s = setup();
    fund(&s);
    assert_eq!(
        s.pool.try_withdraw(&proof(&s.env), &root(&s), &nullifier(&s), &s.user),
        Err(Ok(Error::InvalidProof.into()))
    );
    assert!(!s.pool.is_nullifier_spent(&nullifier(&s)));
}

#[test]
fn withdraw_rejects_another_nullifier() {
    let s = setup();
    fund(&s);
    assert_eq!(
        s.pool.try_withdraw(
            &proof(&s.env),
            &root(&s),
            &BytesN::from_array(&s.env, &[1; 32]),
            &s.recipient
        ),
        Err(Ok(Error::InvalidProof.into()))
    );
}

#[test]
fn withdraw_rejects_an_unknown_root() {
    let s = setup();
    assert_eq!(
        s.pool.try_withdraw(&proof(&s.env), &root(&s), &nullifier(&s), &s.recipient),
        Err(Ok(Error::UnknownRoot.into()))
    );
}

#[test]
fn recent_roots_stay_valid_and_old_ones_expire() {
    let s = setup();
    fund(&s);
    let mut add = |from: u8, to: u8| {
        for i in from..to {
            s.pool.deposit(&s.user, &BytesN::from_array(&s.env, &[i; 32]));
        }
    };
    s.env.cost_estimate().budget().reset_unlimited();
    add(0, 30);
    assert_eq!(
        s.pool.try_withdraw(&proof(&s.env), &root(&s), &nullifier(&s), &s.user),
        Err(Ok(Error::InvalidProof.into())) // root accepted
    );
    for i in 30..110u8 {
        let mut leaf = [0u8; 32];
        leaf[31] = i;
        s.pool.deposit(&s.user, &BytesN::from_array(&s.env, &leaf));
    }
    assert_eq!(
        s.pool.try_withdraw(&proof(&s.env), &root(&s), &nullifier(&s), &s.recipient),
        Err(Ok(Error::UnknownRoot.into()))
    );
    assert_eq!(s.pool.leaves(&0).len(), MAX_PAGE);
}

#[test]
fn deposit_rejects_bad_commitments() {
    let s = setup();
    fund(&s);
    assert_eq!(
        s.pool.try_deposit(&s.user, &hex(&s.env, fixture::LEAF0)),
        Err(Ok(Error::DuplicateCommitment.into()))
    );
    assert_eq!(
        s.pool.try_deposit(&s.user, &BytesN::from_array(&s.env, &[0xff; 32])),
        Err(Ok(Error::NotAFieldElement.into()))
    );
}

#[test]
fn deposit_requires_authorization_and_funds() {
    let s = setup();
    let poor = Address::generate(&s.env);
    assert!(s.pool.try_deposit(&poor, &hex(&s.env, fixture::LEAF0)).is_err());
    assert_eq!(s.pool.pool_info().next_index, 0);
    s.env.set_auths(&[]);
    assert!(s.pool.try_deposit(&s.user, &hex(&s.env, fixture::LEAF0)).is_err());
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn constructor_rejects_a_zero_denomination() {
    let env = Env::default();
    env.register(ShieldedPool, (Address::generate(&env), 0i128, vkey(&env)));
}
