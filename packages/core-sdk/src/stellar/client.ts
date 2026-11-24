import {
  rpc,
  xdr,
  Contract,
  TransactionBuilder,
  Networks,
  scValToNative,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { signTransaction } from '@stellar/freighter-api';
import { EventEmitter } from 'events';
import { Network, NetworkConfig, WalletInfo, SDKConfig } from '../types';
import { NETWORK_CONFIGS, PRIVACY_CONTRACT_METHODS } from './config';
import { logger } from '../utils/logger';

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
  private networkConfigs = new Map<Network, NetworkConfig>();

  constructor(config: Partial<SDKConfig> = {}) {
    super();
    // Copied so setContractId() never mutates the shared NETWORK_CONFIGS.
    const networkConfig = { ...(config.network ?? NETWORK_CONFIGS[Network.TESTNET]) };
    this.networkConfigs.set(networkConfig.network, networkConfig);
    this.config = {
      network: networkConfig,
      storageProvider: config.storageProvider,
    };
    this.rpc = new rpc.Server(networkConfig.rpcUrl);

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
    this.rpc = new rpc.Server(this.config.network.rpcUrl);
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

  async simulateTransaction(
    method: string,
    ...args: xdr.ScVal[]
  ): Promise<rpc.Api.SimulateTransactionResponse> {
    this.requireWallet();
    const operation = this.getContract().call(method, ...args);
    const transaction = (await this.buildTransaction(operation)).build();
    return this.rpc.simulateTransaction(transaction);
  }

  async sendTransaction(method: string, ...args: xdr.ScVal[]): Promise<string> {
    const wallet = this.requireWallet();

    const operation = this.getContract().call(method, ...args);
    const transaction = (await this.buildTransaction(operation)).build();

    const simulated = await this.rpc.simulateTransaction(transaction);
    if (!rpc.Api.isSimulationSuccess(simulated)) {
      throw new Error(`Transaction simulation failed for method "${method}"`);
    }

    const prepared = rpc.assembleTransaction(transaction, simulated);
    const preparedXdr = prepared.build().toEnvelope().toXDR('base64');

    const signedResult = await signTransaction(preparedXdr, {
      networkPassphrase: this.config.network.networkPassphrase,
    });

    if (typeof signedResult !== 'string' && signedResult.error) {
      throw new Error(`Transaction signing failed: ${signedResult.error.message}`);
    }
    const signedXdr = typeof signedResult === 'string' ? signedResult : signedResult.signedTxXdr;

    const signedTransaction = TransactionBuilder.fromXDR(
      signedXdr,
      this.config.network.networkPassphrase as Networks,
    );

    const sendResponse = await this.rpc.sendTransaction(signedTransaction);
    if (sendResponse.status === 'ERROR' || sendResponse.status === 'TRY_AGAIN_LATER') {
      throw new Error(`Transaction rejected by the network: ${sendResponse.status}`);
    }
    const txHash = sendResponse.hash;
    logger.info('Transaction submitted', {
      method,
      network: this.config.network.network,
      source: wallet.publicKey,
      txHash,
      status: sendResponse.status,
    });
    return txHash;
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

  async depositCommitment(
    commitmentHash: string,
    amount: string,
    token: string,
  ): Promise<string> {
    return this.sendTransaction(
      PRIVACY_CONTRACT_METHODS.DEPOSIT,
      nativeToScVal(commitmentHash, { type: 'string' }),
      nativeToScVal(amount, { type: 'string' }),
      nativeToScVal(token, { type: 'string' }),
    );
  }

  async withdrawCommitment(
    nullifier: string,
    merkleProof: string[],
    recipient: string,
    proof: string,
  ): Promise<string> {
    return this.sendTransaction(
      PRIVACY_CONTRACT_METHODS.WITHDRAW,
      nativeToScVal(nullifier, { type: 'string' }),
      nativeToScVal(merkleProof),
      nativeToScVal(recipient, { type: 'string' }),
      nativeToScVal(proof, { type: 'string' }),
    );
  }

  async verifyProof(proof: string, publicInputs: string[]): Promise<boolean> {
    const result = await this.callContract(
      PRIVACY_CONTRACT_METHODS.VERIFY_PROOF,
      nativeToScVal(proof, { type: 'string' }),
      nativeToScVal(publicInputs),
    );
    return scValToNative(result) as boolean;
  }

  async setViewingKey(publicKey: string, encryptedKey: string): Promise<string> {
    return this.sendTransaction(
      PRIVACY_CONTRACT_METHODS.SET_VIEWING_KEY,
      nativeToScVal(publicKey, { type: 'string' }),
      nativeToScVal(encryptedKey, { type: 'string' }),
    );
  }

  async revokeViewingKey(publicKey: string): Promise<string> {
    return this.sendTransaction(
      PRIVACY_CONTRACT_METHODS.REVOKE_VIEWING_KEY,
      nativeToScVal(publicKey, { type: 'string' }),
    );
  }

  async discloseTransaction(txHash: string, disclosureData: string): Promise<string> {
    return this.sendTransaction(
      PRIVACY_CONTRACT_METHODS.DISCLOSE_TRANSACTION,
      nativeToScVal(txHash, { type: 'string' }),
      nativeToScVal(disclosureData, { type: 'string' }),
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
