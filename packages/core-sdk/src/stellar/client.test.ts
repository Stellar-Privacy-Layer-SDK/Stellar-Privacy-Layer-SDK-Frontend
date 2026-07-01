import { describe, it, expect, beforeAll } from 'vitest';
import { StellarClient } from './client';
import { Network } from '../types';

const validContractId = (() => {
  const { StrKey } = require('@stellar/stellar-sdk');
  return StrKey.encodeContract(Buffer.alloc(32, 0x01));
})();

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual('@stellar/stellar-sdk');
  const { xdr } = actual;

  class MockTxBuilder {
    source: any;
    opts: any;
    op: any;
    timeout: number | undefined;
    constructor(source: any, opts: any) {
      this.source = source;
      this.opts = opts;
    }
    addOperation(op: any) { this.op = op; return this; }
    setTimeout(t: number) { this.timeout = t; return this; }
    build() { return {}; }
    static fromXDR = () => ({});
  }

  const scvTrue = xdr.ScVal.scvBool(true);

  return {
    ...actual,
    SorobanRpc: {
      Server: class {
        getAccount() { return { accountId: () => 'GA' + 'X'.repeat(54) }; }
        simulateTransaction() { return { status: 'SUCCESS', result: { retval: scvTrue } }; }
        sendTransaction() { return { status: 'SUCCESS', hash: 'mock_hash' }; }
        getTransaction() { return { status: 'SUCCESS' }; }
        getLedgerEntries() { return { entries: [] }; }
      },
      Api: {
        isSimulationSuccess: () => true,
        isSimulationError: () => false,
        isSimulationRestore: () => false,
        isSimulationRaw: () => false,
      },
      assembleTransaction: () => ({ toXDR: () => 'AAAA...' }),
    },
    TransactionBuilder: MockTxBuilder,
  };
});

vi.mock('@stellar/freighter-api', () => ({
  signTransaction: () => Promise.resolve({
    signedTxXdr: 'AAAA...', signerAddress: 'GA' + 'X'.repeat(54),
  }),
}));

describe('StellarClient', () => {
  let client: StellarClient;

  beforeAll(() => {
    client = new StellarClient();
  });

  it('initializes with testnet config', () => {
    const cfg = client.getNetworkConfig();
    expect(cfg.network).toBe(Network.TESTNET);
    expect(cfg.rpcUrl).toContain('testnet');
  });

  it('reports disconnected initially', () => {
    expect(client.isConnected()).toBe(false);
    expect(client.getWalletInfo()).toBeNull();
  });

  it('connects and stores wallet info', async () => {
    const info = await client.connectWallet('GA' + 'X'.repeat(54), Network.TESTNET);
    expect(info.publicKey).toBe('GA' + 'X'.repeat(54));
    expect(info.isConnected).toBe(true);
    expect(info.network).toBe(Network.TESTNET);
    expect(client.isConnected()).toBe(true);
  });

  it('changes the network config', () => {
    client.switchNetwork(Network.PUBLIC);
    expect(client.getNetworkConfig().network).toBe(Network.PUBLIC);
    client.switchNetwork(Network.TESTNET);
  });

  it('clears wallet on disconnect', () => {
    client.disconnectWallet();
    expect(client.isConnected()).toBe(false);
    expect(client.getWalletInfo()).toBeNull();
  });

  it('sets contract id without error', () => {
    expect(() => client.setContractId(validContractId)).not.toThrow();
  });

  it('sends deposit transaction', async () => {
    client.connectWallet('GA' + 'X'.repeat(54));
    client.setContractId(validContractId);
    const result = await client.depositCommitment('0x' + 'a'.repeat(64), '100', 'USDC');
    expect(result).toBe('SUCCESS');
  });

  it('sends withdraw transaction', async () => {
    const result = await client.withdrawCommitment(
      '0x' + 'b'.repeat(64), ['0x' + 'c'.repeat(64)], 'GA' + 'X'.repeat(54), '{}',
    );
    expect(result).toBe('SUCCESS');
  });

  it('verifies proof via contract call', async () => {
    const result = await client.verifyProof(JSON.stringify({ pi_a: ['1', '2'] }), ['input1']);
    expect(result).toBe(true);
  });
});
