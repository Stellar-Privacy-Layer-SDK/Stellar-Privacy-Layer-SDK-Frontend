import {
  SorobanRpc,
  Contract,
  xdr,
  scValToNative,
  nativeToScVal,
  TransactionBuilder,
  Networks,
} from '@stellar/stellar-sdk';
import { EventEmitter } from 'events';
import { Network, NetworkConfig, WalletInfo, SDKConfig } from '../types';
import { NETWORK_CONFIGS, PRIVACY_CONTRACT_METHODS } from './config';

interface AssembleResult {
  toXDR(): string;
}

export class StellarClient extends EventEmitter {
  private rpc: SorobanRpc.Server;
  private contract: Contract | null = null;
  private config: SDKConfig;
  private walletInfo: WalletInfo | null = null;

  constructor(config: Partial<SDKConfig> = {}) {
    super();
    const networkConfig = config.network || NETWORK_CONFIGS[Network.TESTNET];
    this.config = {
      network: networkConfig,
      storageProvider: config.storageProvider,
    };
    this.rpc = new SorobanRpc.Server(networkConfig.rpcUrl);

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
    this.setNetwork(network);
    this.walletInfo = { publicKey, network, isConnected: true };
    this.emit('onWalletConnected', this.walletInfo);
    return this.walletInfo;
  }

  switchNetwork(network: Network): void {
    this.setNetwork(network);
    if (this.walletInfo) {
      this.walletInfo = { ...this.walletInfo, network };
      this.emit('onWalletConnected', this.walletInfo);
    }
  }

  private setNetwork(network: Network): void {
    this.config.network = NETWORK_CONFIGS[network];
    this.rpc = new SorobanRpc.Server(this.config.network.rpcUrl);
    if (this.config.network.contractId) {
      this.contract = new Contract(this.config.network.contractId);
    }
  }

  disconnectWallet(): void {
    this.walletInfo = null;
    this.emit('onWalletDisconnected');
  }

  setContractId(contractId: string): void {
    this.config.network.contractId = contractId;
    this.contract = new Contract(contractId);
  }

  private getContract(): Contract {
    if (!this.contract) {
      throw new Error('Contract not set. Call setContractId() first.');
    }
    return this.contract;
  }

  async simulateTransaction(method: string, ...args: xdr.ScVal[]): Promise<SorobanRpc.Api.SimulateTransactionResponse> {
    const contract = this.getContract();
    const operation = contract.call(method, ...args);
    const source = await this.rpc.getAccount(this.walletInfo!.publicKey);
    const transaction = new TransactionBuilder(source, {
      fee: '10000',
      networkPassphrase: this.config.network.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    return this.rpc.simulateTransaction(transaction);
  }

  async sendTransaction(method: string, ...args: xdr.ScVal[]): Promise<string> {
    if (!this.walletInfo) throw new Error('Wallet not connected');

    const contract = this.getContract();
    const operation = contract.call(method, ...args);
    const source = await this.rpc.getAccount(this.walletInfo.publicKey);
    const transaction = new TransactionBuilder(source, {
      fee: '10000',
      networkPassphrase: this.config.network.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const simulated = await this.rpc.simulateTransaction(transaction);
    if (!SorobanRpc.Api.isSimulationSuccess(simulated)) {
      throw new Error('Transaction simulation failed');
    }

    const prepared = SorobanRpc.assembleTransaction(transaction, simulated) as unknown as AssembleResult;

    const { signTransaction } = await import('@stellar/freighter-api');
    const signedResult = await signTransaction(
      prepared.toXDR(),
      { networkPassphrase: this.config.network.networkPassphrase },
    );

    const signedXdr = typeof signedResult === 'string' ? signedResult : signedResult.signedTxXdr;

    const signedTransaction = TransactionBuilder.fromXDR(
      signedXdr,
      this.config.network.networkPassphrase as Networks,
    );

    const sendResponse = await this.rpc.sendTransaction(signedTransaction);
    return sendResponse.status;
  }

  async getAccountBalance(publicKey: string): Promise<string> {
    try {
      const account = await this.rpc.getAccount(publicKey);
      return (account as unknown as { balance?: string }).balance || '0';
    } catch {
      return '0';
    }
  }

  async callContract(method: string, ...args: xdr.ScVal[]): Promise<xdr.ScVal> {
    if (!this.walletInfo) throw new Error('Wallet not connected');

    const contract = this.getContract();
    const operation = contract.call(method, ...args);
    const source = await this.rpc.getAccount(this.walletInfo.publicKey);
    const tx = new TransactionBuilder(source, {
      fee: '10000',
      networkPassphrase: this.config.network.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const result = await this.rpc.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationSuccess(result) && result.result?.retval) {
      return result.result.retval;
    }
    throw new Error('Contract call failed');
  }

  async getTransactionStatus(txHash: string): Promise<string> {
    try {
      const response = await this.rpc.getTransaction(txHash);
      return response.status;
    } catch {
      return 'not_found';
    }
  }

  async getLedgerEntry(key: xdr.ScVal): Promise<xdr.ScVal | null> {
    try {
      const cid = this.config.network.contractId;
      const contractIdBytes = Buffer.from(cid.replace(/^0x/i, ''), 'hex');
      const ledgerKey = xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
          contract: xdr.ScAddress.scAddressTypeContract(contractIdBytes),
          key,
          durability: xdr.ContractDataDurability.persistent(),
        }),
      );
      const response = await this.rpc.getLedgerEntries(ledgerKey);
      if (response.entries.length > 0) {
        return response.entries[0].val as unknown as xdr.ScVal;
      }
      return null;
    } catch {
      return null;
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
}
