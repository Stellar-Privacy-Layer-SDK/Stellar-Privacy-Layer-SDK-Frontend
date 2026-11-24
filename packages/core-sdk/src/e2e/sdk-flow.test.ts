import { describe, it, expect, beforeAll } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { PrivacySDK, createMemoryStorageProvider, Network, NETWORK_CONFIGS } from '../index';

const KEY = () => Keypair.random().publicKey();

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual('@stellar/stellar-sdk');
  class MockServer {
    getAccount() { return { accountId: () => 'GA' + 'X'.repeat(54) }; }
    simulateTransaction() { return { status: 'SUCCESS', result: { retval: { type: 'scvBool', _value: true } } }; }
    sendTransaction() { return { status: 'SUCCESS', hash: '0x' + 'f'.repeat(64) }; }
    getTransaction() { return { status: 'SUCCESS' }; }
    getLedgerEntries() { return { entries: [] }; }
  }
  return {
    ...actual,
    rpc: {
      Server: MockServer,
      Api: {
        isSimulationSuccess: () => true,
        isSimulationError: () => false,
        isSimulationRestore: () => false,
        isSimulationRaw: () => false,
      },
      assembleTransaction: () => ({
        build: () => ({ toEnvelope: () => ({ toXDR: () => 'AAAA...' }) }),
      }),
    },
    TransactionBuilder: { fromXDR: () => ({}) },
  };
});

const validContractId = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';

describe('PrivacySDK — Full Flow', () => {
  let sdk: PrivacySDK;

  beforeAll(async () => {
    sdk = new PrivacySDK({ simulateOnFailure: true, storageProvider: createMemoryStorageProvider() });
    await sdk.initialize();
    sdk.client.connectWallet('GA' + 'M'.repeat(54), Network.TESTNET);
    sdk.client.setContractId(validContractId);
  });

  it('initializes all modules', () => {
    expect(sdk.client).toBeDefined();
    expect(sdk.wallet).toBeDefined();
    expect(sdk.shieldedTransfer).toBeDefined();
    expect(sdk.proofGenerator).toBeDefined();
    expect(sdk.proofVerifier).toBeDefined();
    expect(sdk.viewingKeys).toBeDefined();
    expect(sdk.selectiveDisclosure).toBeDefined();
  });

  it('completes a full shielded deposit', async () => {
    const result = await sdk.shieldedTransfer.deposit({
      amount: '1000', token: 'USDC', recipient: KEY(),
    });
    expect(result.txHash).toBeTruthy();
    expect(result.commitmentHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.nullifier).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.status).toBe('pending');
  });

  it('generates and verifies a proof', async () => {
    const { proof, publicInputs } = await sdk.proofGenerator.generateShieldedTransferProof({
      amount: '500', token: 'XLM', recipient: KEY(),
    });
    expect(proof.protocol).toBe('groth16');
    expect(proof.curve).toBe('bn254');
    const valid = await sdk.proofVerifier.verifyProof(proof, publicInputs);
    expect(valid).toBe(true);
  });

  it('creates and manages viewing keys', async () => {
    const key = await sdk.viewingKeys.createViewingKey('E2E Test Key', 'full');
    expect(key.active).toBe(true);
    expect(key.label).toBe('E2E Test Key');

    await sdk.viewingKeys.revokeViewingKey(key.id);
    const revoked = sdk.viewingKeys.getViewingKey(key.id);
    expect(revoked!.active).toBe(false);
  });

  it('executes compliance disclosure flow', async () => {
    const regulatorKey = KEY();
    await sdk.viewingKeys.grantViewingKey(regulatorKey, 'full');
    const hash = await sdk.selectiveDisclosure.discloseToRegulator([], regulatorKey, 'amount-only');
    expect(hash).toBeTruthy();
  });

  it('preserves state across re-initialization', async () => {
    const storage = createMemoryStorageProvider();
    const sdk1 = new PrivacySDK({ simulateOnFailure: true, storageProvider: storage });
    await sdk1.initialize();
    await sdk1.viewingKeys.createViewingKey('Persist Test', 'full');

    const sdk2 = new PrivacySDK({ simulateOnFailure: true, storageProvider: storage });
    await sdk2.initialize();
    const keys = sdk2.viewingKeys.getAllViewingKeys();
    expect(keys.length).toBeGreaterThanOrEqual(1);
  });

  it('handles network switching', () => {
    expect(sdk.client.getNetworkConfig().network).toBe(Network.TESTNET);
    sdk.client.switchNetwork(Network.PUBLIC);
    expect(sdk.client.getNetworkConfig().network).toBe(Network.PUBLIC);
    sdk.client.switchNetwork(Network.TESTNET);
  });

  it('generates unique commitments for different inputs', async () => {
    const a = await sdk.proofGenerator.generateShieldedTransferProof({
      amount: '1', token: 'USDC', recipient: KEY(),
    });
    const b = await sdk.proofGenerator.generateShieldedTransferProof({
      amount: '2', token: 'USDC', recipient: KEY(),
    });
    expect(a.commitment).not.toBe(b.commitment);
    expect(a.nullifier).not.toBe(b.nullifier);
  });

  it('generates structurally valid Groth16 proofs', async () => {
    const { proof } = await sdk.proofGenerator.generateShieldedTransferProof({
      amount: '777', token: 'USDC', recipient: KEY(),
    });
    expect(sdk.proofVerifier.verifyProofStructure(proof)).toBe(true);
    expect(typeof proof.pi_a[0]).toBe('string');
    expect(proof.protocol).toBe('groth16');
    expect(proof.curve).toBe('bn254');
  });

  it('accepts network and logLevel options', async () => {
    const sdk2 = new PrivacySDK({ simulateOnFailure: true,
      network: NETWORK_CONFIGS[Network.FUTURENET],
      logLevel: 'debug',
      storageProvider: createMemoryStorageProvider(),
    });
    expect(sdk2.client.getNetworkConfig().network).toBe(Network.FUTURENET);
    expect(sdk2.wallet.getWalletInfo()).toBeNull();
  });

  it('shares one proof generator across modules', () => {
    expect(sdk.shieldedTransfer['proofGenerator']).toBe(sdk.proofGenerator);
  });
});
