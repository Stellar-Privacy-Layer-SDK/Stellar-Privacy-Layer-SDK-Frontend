import {
  Address,
  rpc,
  xdr,
  Contract,
  TransactionBuilder,
  scValToNative,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { EventEmitter } from 'events';
import { Network, NetworkConfig, PoolInfo, WalletInfo, SDKConfig, ZKProof } from '../types.js';
import { NETWORK_CONFIGS } from './config.js';
import { encodeGroth16Proof, fieldBytes } from './abi.js';
import { toHex } from '../utils/encoding.js';
import { logger } from '../utils/logger.js';

/** The transaction definitely did not reach the network. */
export class NotSubmittedError extends Error {}

/** Signs a transaction envelope (base64 XDR) and returns the signed envelope. */
export type TransactionSigner = (xdr: string, networkPassphrase: string) => Promise<string>;

// Loaded on first use: the Freighter build cannot be imported by plain Node.
const signWithFreighter: TransactionSigner = async (xdr, networkPassphrase) => {
  const { signTransaction } = await import('@stellar/freighter-api');
  const result = await signTransaction(xdr, { networkPassphrase });
  if (typeof result === 'string') return result;
  if (result.error) throw new Error(`Transaction signing failed: ${result.error.message}`);
  return result.signedTxXdr;
};

/** Plain HTTP is only allowed for the local sandbox. */
function createServer(config: NetworkConfig): rpc.Server {
  return new rpc.Server(config.rpcUrl, { allowHttp: config.network === Network.SANDBOX });
}

/**
 * Client for the Soroban RPC server and the privacy verifier contract.
 *
 * Owns the RPC connection and the currently connected wallet; all on-chain
 * operations funnel through this class so the rest of the SDK stays
 * network-agnostic.
 */
export class StellarClient extends EventEmitter {
  private rpc: rpc.Server;
  private contract: Contract | null = null;
  private config: SDKConfig;
  private walletInfo: WalletInfo | null = null;
  private signer: TransactionSigner;
  private networkConfigs = new Map<Network, NetworkConfig>();

  constructor(config: Partial<SDKConfig> & { signer?: TransactionSigner } = {}) {
    super();
    this.signer = config.signer ?? signWithFreighter;
    // Copied so setContractId() never mutates the shared NETWORK_CONFIGS.
    const networkConfig = { ...(config.network ?? NETWORK_CONFIGS[Network.TESTNET]) };
    this.networkConfigs.set(networkConfig.network, networkConfig);
    this.config = {
      network: networkConfig,
      storageProvider: config.storageProvider,
    };
    this.rpc = createServer(networkConfig);

    if (networkConfig.contractId) {
      this.contract = new Contract(networkConfig.contractId);
    }
  }

  getNetworkConfig(): NetworkConfig {
    return this.config.network;
  }

  getWalletInfo(): WalletInfo | null {
    return this.walletInfo;
  }

  isConnected(): boolean {
    return this.walletInfo?.isConnected ?? false;
  }

  async connectWallet(publicKey: string, network: Network = Network.TESTNET): Promise<WalletInfo> {
    if (!publicKey) {
      throw new Error('Cannot connect wallet: public key is required');
    }
    this.setNetwork(network);
    this.walletInfo = { publicKey, network, isConnected: true };
    this.emit('onWalletConnected', this.walletInfo);
    logger.info('Wallet connected', { publicKey, network });
    return this.walletInfo;
  }

  switchNetwork(network: Network): void {
    this.setNetwork(network);
    if (this.walletInfo) {
      this.walletInfo = { ...this.walletInfo, network };
      this.emit('onWalletConnected', this.walletInfo);
    }
    logger.info('Network switched', { network });
  }

  private setNetwork(network: Network): void {
    // Custom endpoints and contract IDs belong to the network they were
    // configured for; keep them when (re)selecting that same network.
    if (network === this.config.network.network) return;
    this.config.network = { ...(this.networkConfigs.get(network) ?? NETWORK_CONFIGS[network]) };
    this.networkConfigs.set(network, this.config.network);
    this.rpc = createServer(this.config.network);
    this.contract = this.config.network.contractId
      ? new Contract(this.config.network.contractId)
      : null;
  }

  disconnectWallet(): void {
    this.walletInfo = null;
    this.emit('onWalletDisconnected');
    logger.info('Wallet disconnected');
  }

  setContractId(contractId: string): void {
    if (!contractId) {
      throw new Error('Contract ID is required');
    }
    this.config.network.contractId = contractId;
    this.contract = new Contract(contractId);
    logger.info('Contract ID set', { contractId });
  }

  private getContract(): Contract {
    if (!this.contract) {
      throw new Error('Contract not set. Call setContractId() first.');
    }
    return this.contract;
  }

  private requireWallet(): WalletInfo {
    if (!this.walletInfo || !this.walletInfo.isConnected) {
      throw new Error('Wallet not connected');
    }
    return this.walletInfo;
  }

  private async buildTransaction(operation: xdr.Operation): Promise<TransactionBuilder> {
    const wallet = this.requireWallet();
    const source = await this.rpc.getAccount(wallet.publicKey);
    return new TransactionBuilder(source, {
      fee: '10000',
      networkPassphrase: this.config.network.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30);
  }

  async sendTransaction(method: string, ...args: xdr.ScVal[]): Promise<string> {
    const signed = await this.prepareAndSign(method, args).catch((error: unknown) => {
      throw new NotSubmittedError(this.errorMessage(error), { cause: error });
    });
    const response = await this.rpc.sendTransaction(signed);
    if (response.status === 'ERROR' || response.status === 'TRY_AGAIN_LATER') {
      throw new NotSubmittedError(`Transaction rejected by the network: ${response.status}`);
    }
    logger.info('Transaction submitted', {
      method,
      network: this.config.network.network,
      txHash: response.hash,
      status: response.status,
    });
    return response.hash;
  }

  private async prepareAndSign(method: string, args: xdr.ScVal[]) {
    this.requireWallet();
    const operation = this.getContract().call(method, ...args);
    const transaction = (await this.buildTransaction(operation)).build();

    const simulated = await this.rpc.simulateTransaction(transaction);
    if (!rpc.Api.isSimulationSuccess(simulated)) {
      throw new Error(`Transaction simulation failed for method "${method}"`);
    }
    const prepared = rpc.assembleTransaction(transaction, simulated).build();
    const { networkPassphrase } = this.config.network;
    const signedXdr = await this.signer(prepared.toEnvelope().toXDR('base64'), networkPassphrase);
    return TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  }

  async getAccountBalance(publicKey: string): Promise<string> {
    try {
      // Soroban RPC accounts carry no balances; Horizon does.
      const response = await fetch(
        `${this.config.network.horizonUrl}/accounts/${encodeURIComponent(publicKey)}`,
      );
      if (!response.ok) throw new Error(`Horizon responded with ${response.status}`);
      const account = (await response.json()) as {
        balances?: { asset_type: string; balance: string }[];
      };
      return account.balances?.find((b) => b.asset_type === 'native')?.balance ?? '0';
    } catch (error) {
      logger.warn('Failed to fetch account balance', {
        publicKey,
        error: this.errorMessage(error),
      });
      return '0';
    }
  }

  async callContract(method: string, ...args: xdr.ScVal[]): Promise<xdr.ScVal> {
    this.requireWallet();

    const operation = this.getContract().call(method, ...args);
    const transaction = (await this.buildTransaction(operation)).build();

    const result = await this.rpc.simulateTransaction(transaction);
    if (rpc.Api.isSimulationSuccess(result) && result.result?.retval) {
      return result.result.retval;
    }
    throw new Error(`Contract call failed for method "${method}"`);
  }

  async getTransactionStatus(txHash: string): Promise<string> {
    try {
      const response = await this.rpc.getTransaction(txHash);
      return response.status;
    } catch (error) {
      logger.warn('Failed to fetch transaction status', {
        txHash,
        error: this.errorMessage(error),
      });
      return 'not_found';
    }
  }

  /** Encodes a field element as the contract's `BytesN<32>`. */
  private field(value: string): xdr.ScVal {
    return nativeToScVal(fieldBytes(value), { type: 'bytes' });
  }

  async getPoolInfo(): Promise<PoolInfo> {
    const info = scValToNative(await this.callContract('pool_info')) as {
      token: string;
      denomination: bigint;
      next_index: number;
      root: Uint8Array;
    };
    return {
      token: info.token,
      denomination: info.denomination.toString(),
      depositCount: info.next_index,
      root: '0x' + toHex(info.root),
    };
  }

  /** Commitments from index `start` on, in insertion order. */
  async getLeaves(start = 0): Promise<string[]> {
    const leaves: string[] = [];
    for (;;) {
      const page = scValToNative(
        await this.callContract('leaves', xdr.ScVal.scvU32(start + leaves.length)),
      ) as Uint8Array[];
      if (page.length === 0) return leaves;
      leaves.push(...page.map((leaf) => '0x' + toHex(leaf)));
    }
  }

  async isNullifierSpent(nullifier: string): Promise<boolean> {
    return scValToNative(
      await this.callContract('is_nullifier_spent', this.field(nullifier)),
    ) as boolean;
  }

  /** Deposits one denomination from the connected wallet. */
  async deposit(commitment: string): Promise<string> {
    return this.sendTransaction(
      'deposit',
      Address.fromString(this.requireWallet().publicKey).toScVal(),
      this.field(commitment),
    );
  }

  async withdraw(
    proof: ZKProof,
    root: string,
    nullifier: string,
    recipient: string,
  ): Promise<string> {
    return this.sendTransaction(
      'withdraw',
      nativeToScVal(encodeGroth16Proof(proof), {
        type: { a: ['symbol', 'bytes'], b: ['symbol', 'bytes'], c: ['symbol', 'bytes'] },
      }),
      this.field(root),
      this.field(nullifier),
      Address.fromString(recipient).toScVal(),
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
