import { describe, it, expect, beforeAll } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import { SelectiveDisclosure } from './selective-disclosure';
import { ViewingKeyManager } from './viewing-keys';
import { ProofGenerator } from '../privacy/proof-generator';
import { StellarClient } from '../stellar/client';
import { createMemoryStorageProvider } from '../utils/storage';
import type { ShieldedTransaction, ComplianceDisclosureRequest } from '../types';
import { Network } from '../types';

const validContractId = StrKey.encodeContract(Buffer.alloc(32, 0x01));

vi.mock('@stellar/freighter-api', () => ({
  signTransaction: async () => ({ signedTxXdr: 'AAAA...', signerAddress: '' }),
}));

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual('@stellar/stellar-sdk');

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

  return {
    ...actual,
    rpc: {
      Server: class {
        getAccount() { return { accountId: () => 'GA' + 'X'.repeat(54) }; }
        simulateTransaction() { return { status: 'SUCCESS' }; }
        sendTransaction() { return { status: 'SUCCESS' }; }
        getTransaction() { return { status: 'SUCCESS' }; }
        getLedgerEntries() { return { entries: [] }; }
      },
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
    TransactionBuilder: MockTxBuilder,
  };
});

function makeTx(overrides: Partial<ShieldedTransaction> = {}): ShieldedTransaction {
  return {
    txHash: '0x' + 'a'.repeat(64),
    commitmentHash: '0x' + 'b'.repeat(64),
    nullifier: '0x' + 'c'.repeat(64),
    amount: '100',
    token: 'USDC',
    recipient: 'GA' + 'X'.repeat(54),
    timestamp: Date.now(),
    status: 'confirmed',
    ...overrides,
  };
}

describe('SelectiveDisclosure', () => {
  let sd: SelectiveDisclosure;
  let vk: ViewingKeyManager;
  let client: StellarClient;
  let pg: ProofGenerator;

  beforeAll(async () => {
    client = new StellarClient();
    vk = new ViewingKeyManager(createMemoryStorageProvider());
    pg = new ProofGenerator();
    sd = new SelectiveDisclosure(client, vk, pg);
    await client.connectWallet('GA' + 'X'.repeat(54), Network.TESTNET);
    client.setContractId(validContractId);
  });

  it('creates a request ID', async () => {
    const request: ComplianceDisclosureRequest = {
      regulatorPublicKey: 'GA' + 'R'.repeat(54),
      scope: 'full', reason: 'Audit',
    };
    const id = await sd.requestDisclosure(request);
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('returns payloads for disclosure', async () => {
    const request: ComplianceDisclosureRequest = {
      regulatorPublicKey: 'GA' + 'R'.repeat(54),
      scope: 'full', reason: 'Compliance check',
    };
    const requestId = await sd.requestDisclosure(request);
    const txs = [makeTx({ amount: '500' }), makeTx({ amount: '250' })];
    const payloads = await sd.approveDisclosure(requestId, txs);

    expect(payloads).toHaveLength(2);
    expect(payloads[0].amount).toBe('500');
    expect(payloads[0].recipient).toBeTruthy();
    expect(payloads[0].proof.protocol).toBe('groth16');
  });

  it('scopes amount-only correctly', async () => {
    const req: ComplianceDisclosureRequest = {
      regulatorPublicKey: 'GA' + 'R'.repeat(54),
      scope: 'amount-only', reason: 'Test',
    };
    const id = await sd.requestDisclosure(req);
    const payloads = await sd.approveDisclosure(id, [makeTx({ amount: '777' })]);
    expect(payloads[0].amount).toBe('777');
    expect(payloads[0].recipient).toBeUndefined();
  });

  it('scopes recipient-only correctly', async () => {
    const req: ComplianceDisclosureRequest = {
      regulatorPublicKey: 'GA' + 'R'.repeat(54),
      scope: 'recipient-only', reason: 'Test',
    };
    const id = await sd.requestDisclosure(req);
    const payloads = await sd.approveDisclosure(id, [makeTx()]);
    expect(payloads[0].amount).toBeUndefined();
    expect(payloads[0].recipient).toBeTruthy();
  });

  it('throws for unknown request ID', async () => {
    await expect(sd.approveDisclosure('nonexistent', [makeTx()])).rejects.toThrow('Disclosure request not found');
  });

  it('submits disclosure to regulator', async () => {
    const hash = await sd.discloseToRegulator([makeTx()], 'GA' + 'R'.repeat(54), 'full');
    expect(hash).toBeTruthy();
  });

  it('verifies a disclosure payload', async () => {
    const req: ComplianceDisclosureRequest = {
      regulatorPublicKey: 'GA' + 'V'.repeat(54),
      scope: 'full', reason: 'Verification',
    };
    const id = await sd.requestDisclosure(req);
    const payloads = await sd.approveDisclosure(id, [makeTx()]);
    const valid = await sd.verifyDisclosure(payloads[0], 'GA' + 'V'.repeat(54));
    expect(valid).toBe(true);
  });

  it.each(['amount-only', 'recipient-only'] as const)('verifies %s disclosures', async (scope) => {
    const regulator = 'GA' + 'P'.repeat(54);
    const id = await sd.requestDisclosure({ regulatorPublicKey: regulator, scope, reason: 'Test' });
    const [payload] = await sd.approveDisclosure(id, [makeTx()]);
    expect(await sd.verifyDisclosure(payload, regulator)).toBe(true);
  });

  it('verifies signed payloads using the viewing key signature', async () => {
    const regulator = 'GA' + 'W'.repeat(54);
    await vk.grantViewingKey(regulator, 'full');
    const req: ComplianceDisclosureRequest = {
      regulatorPublicKey: regulator,
      scope: 'full', reason: 'Signed audit',
    };
    const id = await sd.requestDisclosure(req);
    const payloads = await sd.approveDisclosure(id, [makeTx()]);
    expect(payloads[0].regulatorSignature).toBeTruthy();
    const valid = await sd.verifyDisclosure(payloads[0], regulator);
    expect(valid).toBe(true);
  });

  it('stores and retrieves disclosure payloads by transaction hash', async () => {
    const req: ComplianceDisclosureRequest = {
      regulatorPublicKey: 'GA' + 'Y'.repeat(54),
      scope: 'full', reason: 'Storage',
    };
    const id = await sd.requestDisclosure(req);
    const tx = makeTx({ txHash: '0xabc123' });
    await sd.approveDisclosure(id, [tx]);
    const payload = sd.getDisclosurePayload('0xabc123');
    expect(payload).toBeDefined();
    expect(payload!.transactionHash).toBe('0xabc123');
    expect(sd.getDisclosurePayload('missing')).toBeUndefined();
  });

  it('runs an audit disclosure for a regulator', async () => {
    const payloads = await sd.requestAuditDisclosure([makeTx()], 'GA' + 'Z'.repeat(54));
    expect(payloads).toHaveLength(1);
    expect(payloads[0].scope).toBe('full');
  });
});
