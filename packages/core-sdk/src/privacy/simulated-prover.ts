import { bn254 } from '@noble/curves/bn254.js';
import {
  poseidonHash,
  generateRandomField,
  generateNullifier,
  generateCommitment,
} from '../utils/crypto';
import type { Prover } from './prover';
import type { ZKProof, ShieldedTransferParams } from '../types';

const Fr = bn254.fields.Fr;

export class SimulatedProver implements Prover {
  private initialized = false;

  async initialize(): Promise<void> { this.initialized = true; }
  isReady(): boolean { return this.initialized; }

  async generateShieldedProof(
    params: ShieldedTransferParams,
    secret: string,
  ): ReturnType<Prover['generateShieldedProof']> {
    const senderSecret = secret;
    const nullifier = await generateNullifier(senderSecret, 0);
    const commitment = await generateCommitment(senderSecret, params.recipient, params.amount, params.token);
    const merkleRoot = await poseidonHash([commitment]);
    const publicInputs = [commitment, nullifier, merkleRoot, params.recipient];
    const publicInputHash = await poseidonHash(publicInputs);
    const challenge = Fr.create(BigInt('0x' + publicInputHash.slice(2)));
    const blinding = Fr.create(BigInt('0x' + (await generateRandomField()).slice(2)));
    const randField = Fr.create(BigInt('0x' + (await generateRandomField()).slice(2)));

    const piA0 = Fr.add(challenge, blinding);
    const piA1 = Fr.sub(randField, blinding);
    const piC0 = Fr.sub(Fr.add(piA0, piA1), challenge);

    return {
      proof: {
        pi_a: [fieldHex(piA0), fieldHex(piA1)],
        pi_b: [[fieldHex(await rand()), fieldHex(await rand())], [fieldHex(await rand()), fieldHex(await rand())]],
        pi_c: [fieldHex(piC0), fieldHex(await rand())],
        protocol: 'groth16',
        curve: 'bn254',
      },
      publicInputs,
      commitment,
      nullifier,
    };
  }

  async generateWithdrawalProof(...args: Parameters<Prover['generateWithdrawalProof']>): Promise<ZKProof> {
    const [commitment, nullifier, merkleProof, recipient, amount] = args;
    const publicInputs = [commitment, nullifier, ...merkleProof, recipient, amount];
    const publicInputHash = await poseidonHash(publicInputs);
    const challenge = Fr.create(BigInt('0x' + publicInputHash.slice(2)));
    const blinding = Fr.create(BigInt('0x' + (await generateRandomField()).slice(2)));
    const randField = Fr.create(BigInt('0x' + (await generateRandomField()).slice(2)));

    const piA0 = Fr.add(challenge, blinding);
    const piA1 = Fr.sub(randField, blinding);
    const piC0 = Fr.sub(Fr.add(piA0, piA1), challenge);

    return {
      pi_a: [fieldHex(piA0), fieldHex(piA1)],
      pi_b: [[fieldHex(await rand()), fieldHex(await rand())], [fieldHex(await rand()), fieldHex(await rand())]],
      pi_c: [fieldHex(piC0), fieldHex(await rand())],
      protocol: 'groth16',
      curve: 'bn254',
    };
  }

  async generateDisclosureProof(...args: Parameters<Prover['generateDisclosureProof']>): Promise<ZKProof> {
    const [commitment, amount, recipient, vk] = args;
    const publicInputs = [commitment, amount, recipient, vk];
    const publicInputHash = await poseidonHash(publicInputs);
    const challenge = Fr.create(BigInt('0x' + publicInputHash.slice(2)));
    const blinding = Fr.create(BigInt('0x' + (await generateRandomField()).slice(2)));
    const randField = Fr.create(BigInt('0x' + (await generateRandomField()).slice(2)));

    const piA0 = Fr.add(challenge, blinding);
    const piA1 = Fr.sub(randField, blinding);
    const piC0 = Fr.sub(Fr.add(piA0, piA1), challenge);

    return {
      pi_a: [fieldHex(piA0), fieldHex(piA1)],
      pi_b: [[fieldHex(await rand()), fieldHex(await rand())], [fieldHex(await rand()), fieldHex(await rand())]],
      pi_c: [fieldHex(piC0), fieldHex(await rand())],
      protocol: 'groth16',
      curve: 'bn254',
    };
  }

  async verifyProof(proof: ZKProof, publicInputs: string[]): Promise<boolean> {
    try {
      if (proof.protocol !== 'groth16' || proof.curve !== 'bn254') return false;
      const challenge = await poseidonHash(publicInputs);
      const cF = Fr.create(BigInt('0x' + challenge.slice(2)));
      const a0 = Fr.create(BigInt('0x' + proof.pi_a[0].slice(2)));
      const a1 = Fr.create(BigInt('0x' + proof.pi_a[1].slice(2)));
      const c0 = Fr.create(BigInt('0x' + proof.pi_c[0].slice(2)));
      return Fr.add(a0, a1) === Fr.add(cF, c0);
    } catch { return false; }
  }
}

function fieldHex(n: bigint): string {
  return '0x' + n.toString(16).padStart(64, '0');
}

async function rand(): Promise<bigint> {
  return Fr.create(BigInt('0x' + (await generateRandomField()).slice(2)));
}
