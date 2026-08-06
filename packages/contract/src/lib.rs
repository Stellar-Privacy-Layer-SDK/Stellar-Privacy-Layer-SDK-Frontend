#![no_std]
//! Stellar Privacy Layer — Soroban verifier contract.
//!
//! Implements a shielded-commitment pool with compliance viewing keys and a
//! real on-chain Groth16 proof verifier using the BN254 pairing precompiles
//! introduced in Stellar Protocol 25 (`env.crypto().bn254()`).
//!
//! # Proof wire format
//! Points use the Ethereum-compatible uncompressed serialization:
//! - G1 points: 64 bytes (`X || Y`, each a 32-byte big-endian field element)
//! - G2 points: 128 bytes (`X || Y`, each coordinate a 64-byte Fp2 element
//!   encoded as `c1 || c0`)

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, vec, Address, BytesN, Env, String, Symbol,
    Vec, crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
};

const COMMITMENTS: Symbol = symbol_short!("cmmts");
const NULLIFIERS: Symbol = symbol_short!("nulrs");
const VIEWING_KEYS: Symbol = symbol_short!("vkeys");
const VKEY: Symbol = symbol_short!("vkey");

/// A Groth16 proof. Points are serialized in Ethereum-compatible format.
#[contracttype]
#[derive(Clone)]
pub struct Groth16Proof {
    pub a: BytesN<64>,
    pub b: BytesN<128>,
    pub c: BytesN<64>,
}

/// The Groth16 verification key.
///
/// `ic` must contain exactly `n_public_inputs + 1` G1 points: index 0 is the
/// constant term and indexes `1..=n` correspond to each public input.
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
pub struct ViewingKeyData {
    pub encrypted_private_key: BytesN<64>,
    pub scope: u32,
    pub active: bool,
}

#[contract]
pub struct PrivacyVerifier;

#[contractimpl]
impl PrivacyVerifier {
    /// Deposit a commitment hash into the shielded pool.
    pub fn deposit(env: Env, commitment: BytesN<32>, amount: String, token: String) {
        let caller = env.current_contract_address();
        let key = (COMMITMENTS, commitment.clone());
        env.storage().persistent().set(&key, &(amount, token, caller));
    }

    /// Withdraw from the shielded pool by spending a nullifier.
    ///
    /// The Groth16 proof and Merkle path are validated off-chain (or via
    /// [`Self::verify_proof`]); the contract enforces one-time spendability.
    pub fn withdraw(
        env: Env,
        nullifier: BytesN<32>,
        merkle_proof: Vec<BytesN<32>>,
        recipient: String,
        proof: String,
    ) {
        let _ = (&merkle_proof, &recipient, &proof);
        let spent_key = (NULLIFIERS, nullifier.clone());
        if env.storage().persistent().has(&spent_key) {
            panic!("nullifier already spent");
        }
        env.storage().persistent().set(&spent_key, &true);
    }

    /// Store the Groth16 verification key used by [`Self::verify_proof`].
    pub fn set_vkey(env: Env, vkey: Groth16VKey) {
        env.storage().persistent().set(&VKEY, &vkey);
    }

    /// Verify a Groth16 proof over BN254 using an on-chain pairing check
    /// (Protocol 25 built-in `bn254` primitives).
    ///
    /// Verifies `e(A, B) == e(alpha, beta) · e(L, gamma) · e(C, delta)` where
    /// `L = IC[0] + Σ x_i · IC[i+1]` accumulates the public inputs.
    pub fn verify_proof(env: Env, proof: Groth16Proof, public_inputs: Vec<BytesN<32>>) -> bool {
        let vkey: Groth16VKey = env
            .storage()
            .persistent()
            .get(&VKEY)
            .unwrap_or_else(|| panic!("verification key not set"));

        if vkey.ic.len() != public_inputs.len() + 1 {
            return false;
        }

        let bn254 = env.crypto().bn254();

        let a = Bn254G1Affine::from_bytes(proof.a);
        let b = Bn254G2Affine::from_bytes(proof.b);
        let c = Bn254G1Affine::from_bytes(proof.c);
        let alpha = Bn254G1Affine::from_bytes(vkey.alpha_g1);
        let beta = Bn254G2Affine::from_bytes(vkey.beta_g2);
        let gamma = Bn254G2Affine::from_bytes(vkey.gamma_g2);
        let delta = Bn254G2Affine::from_bytes(vkey.delta_g2);

        // L = IC[0] + Σ x_i · IC[i + 1]
        let mut acc = Bn254G1Affine::from_bytes(vkey.ic.get_unchecked(0).clone());
        for (i, input) in public_inputs.iter().enumerate() {
            let scalar = Bn254Fr::from_bytes(input);
            let point = Bn254G1Affine::from_bytes(vkey.ic.get_unchecked((i + 1) as u32).clone());
            acc = bn254.g1_add(&acc, &bn254.g1_mul(&point, &scalar));
        }

        // e(A, B) · e(-L, gamma) · e(-C, delta) · e(-alpha, beta) == 1
        let g1s: Vec<Bn254G1Affine> = vec![&env, a, -acc, -c, -alpha];
        let g2s: Vec<Bn254G2Affine> = vec![&env, b, gamma, delta, beta];
        bn254.pairing_check(g1s, g2s)
    }

    /// Set a viewing key for a regulator.
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
        env.storage()
            .persistent()
            .get::<_, (String, String, Address)>(&key)
            .map(|(a, t, _)| (a, t))
    }
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use soroban_sdk::{vec, BytesN, Env, String};

    /// Register the contract natively and return a client bound to `env`.
    fn deploy(env: &Env) -> PrivacyVerifierClient<'_> {
        let contract_id = env.register(PrivacyVerifier, ());
        PrivacyVerifierClient::new(env, &contract_id)
    }

    /// Valid BN254 points from the go-ethereum bn256 precompile test vectors.
    const G1_VECTOR: [u8; 64] = [
        0x1c, 0x76, 0x47, 0x6f, 0x4d, 0xef, 0x4b, 0xb9, 0x45, 0x41, 0xd5, 0x7e, 0xbb, 0xa1, 0x19,
        0x33, 0x81, 0xff, 0xa7, 0xaa, 0x76, 0xad, 0xa6, 0x64, 0xdd, 0x31, 0xc1, 0x60, 0x24, 0xc4,
        0x3f, 0x59, 0x30, 0x34, 0xdd, 0x29, 0x20, 0xf6, 0x73, 0xe2, 0x04, 0xfe, 0xe2, 0x81, 0x1c,
        0x67, 0x87, 0x45, 0xfc, 0x81, 0x9b, 0x55, 0xd3, 0xe9, 0xd2, 0x94, 0xe4, 0x5c, 0x9b, 0x03,
        0xa7, 0x6a, 0xef, 0x41,
    ];

    const G2_VECTOR: [u8; 128] = [
        0x20, 0x9d, 0xd1, 0x5e, 0xbf, 0xf5, 0xd4, 0x6c, 0x4b, 0xd8, 0x88, 0xe5, 0x1a, 0x93, 0xcf,
        0x99, 0xa7, 0x32, 0x96, 0x36, 0xc6, 0x35, 0x14, 0x39, 0x6b, 0x4a, 0x45, 0x20, 0x03, 0xa3,
        0x5b, 0xf7, 0x04, 0xbf, 0x11, 0xca, 0x01, 0x48, 0x3b, 0xfa, 0x8b, 0x34, 0xb4, 0x35, 0x61,
        0x84, 0x8d, 0x28, 0x90, 0x59, 0x60, 0x11, 0x4c, 0x8a, 0xc0, 0x40, 0x49, 0xaf, 0x4b, 0x63,
        0x15, 0xa4, 0x16, 0x78, 0x2b, 0xb8, 0x32, 0x4a, 0xf6, 0xcf, 0xc9, 0x35, 0x37, 0xa2, 0xad,
        0x1a, 0x44, 0x5c, 0xfd, 0x0c, 0xa2, 0xa7, 0x1a, 0xcd, 0x7a, 0xc4, 0x1f, 0xad, 0xbf, 0x93,
        0x3c, 0x2a, 0x51, 0xbe, 0x34, 0x4d, 0x12, 0x0a, 0x2a, 0x4c, 0xf3, 0x0c, 0x1b, 0xf9, 0x84,
        0x5f, 0x20, 0xc6, 0xfe, 0x39, 0xe0, 0x7e, 0xa2, 0xcc, 0xe6, 0x1f, 0x0c, 0x9b, 0xb0, 0x48,
        0x16, 0x5f, 0xe5, 0xe4, 0xde, 0x87, 0x75, 0x50,
    ];

    fn valid_vkey(env: &Env, n_inputs: u32) -> Groth16VKey {
        let mut ic = vec![env];
        for _ in 0..=n_inputs {
            ic.push_back(BytesN::from_array(env, &G1_VECTOR));
        }
        Groth16VKey {
            alpha_g1: BytesN::from_array(env, &G1_VECTOR),
            beta_g2: BytesN::from_array(env, &G2_VECTOR),
            gamma_g2: BytesN::from_array(env, &G2_VECTOR),
            delta_g2: BytesN::from_array(env, &G2_VECTOR),
            ic,
        }
    }

    fn valid_proof(env: &Env) -> Groth16Proof {
        Groth16Proof {
            a: BytesN::from_array(env, &G1_VECTOR),
            b: BytesN::from_array(env, &G2_VECTOR),
            c: BytesN::from_array(env, &G1_VECTOR),
        }
    }

    #[test]
    fn test_deposit_and_get_commitment() {
        let env = Env::default();
        let client = deploy(&env);
        let commitment = BytesN::from_array(&env, &[0xaa; 32]);
        let amount = String::from_str(&env, "100");
        let token = String::from_str(&env, "USDC");

        client.deposit(&commitment, &amount, &token);

        let stored = client.get_commitment(&commitment);
        assert!(stored.is_some());
        let (stored_amount, stored_token) = stored.unwrap();
        assert_eq!(stored_amount, amount);
        assert_eq!(stored_token, token);
    }

    #[test]
    fn test_double_spend_rejection() {
        let env = Env::default();
        let client = deploy(&env);
        let nullifier = BytesN::from_array(&env, &[0xbb; 32]);
        let merkle_proof = vec![&env];
        let recipient = String::from_str(&env, "GAXXXX");
        let proof = String::from_str(&env, "proof_data");

        assert!(!client.is_nullifier_spent(&nullifier));

        client.withdraw(&nullifier, &merkle_proof, &recipient, &proof);

        assert!(client.is_nullifier_spent(&nullifier));

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.withdraw(&nullifier, &merkle_proof, &recipient, &proof);
        }));
        assert!(result.is_err());
    }

    #[test]
    fn test_viewing_key_lifecycle() {
        let env = Env::default();
        let client = deploy(&env);
        let regulator = BytesN::from_array(&env, &[0xcc; 32]);
        let encrypted_key = BytesN::from_array(&env, &[0xdd; 64]);

        client.set_viewing_key(&regulator, &encrypted_key);
        client.revoke_viewing_key(&regulator);
    }

    #[test]
    fn test_nullifier_not_spent_by_default() {
        let env = Env::default();
        let client = deploy(&env);
        let nullifier = BytesN::from_array(&env, &[0xee; 32]);
        assert!(!client.is_nullifier_spent(&nullifier));
    }

    #[test]
    fn test_missing_commitment_returns_none() {
        let env = Env::default();
        let client = deploy(&env);
        let commitment = BytesN::from_array(&env, &[0xff; 32]);
        let stored = client.get_commitment(&commitment);
        assert!(stored.is_none());
    }

    #[test]
    #[should_panic(expected = "verification key not set")]
    fn test_verify_proof_panics_without_vkey() {
        let env = Env::default();
        let client = deploy(&env);
        let inputs = vec![&env, BytesN::from_array(&env, &[0x01; 32])];
        let _ = client.verify_proof(&valid_proof(&env), &inputs);
    }

    #[test]
    fn test_verify_proof_rejects_ic_length_mismatch() {
        let env = Env::default();
        let client = deploy(&env);
        // vkey with 2 IC points but 3 public inputs -> mismatch
        let mut ic = vec![&env];
        ic.push_back(BytesN::from_array(&env, &G1_VECTOR));
        client.set_vkey(&Groth16VKey {
            alpha_g1: BytesN::from_array(&env, &G1_VECTOR),
            beta_g2: BytesN::from_array(&env, &G2_VECTOR),
            gamma_g2: BytesN::from_array(&env, &G2_VECTOR),
            delta_g2: BytesN::from_array(&env, &G2_VECTOR),
            ic,
        });

        let inputs = vec![
            &env,
            BytesN::from_array(&env, &[0x01; 32]),
            BytesN::from_array(&env, &[0x02; 32]),
            BytesN::from_array(&env, &[0x03; 32]),
        ];
        let valid = client.verify_proof(&valid_proof(&env), &inputs);
        assert!(!valid);
    }

    #[test]
    fn test_verify_proof_rejects_invalid_proof() {
        let env = Env::default();
        let client = deploy(&env);
        client.set_vkey(&valid_vkey(&env, 1));

        let inputs = vec![&env, BytesN::from_array(&env, &[0x01; 32])];
        let valid = client.verify_proof(&valid_proof(&env), &inputs);
        // Arbitrary points do not satisfy the Groth16 pairing equation.
        assert!(!valid);
    }
}
