import { EventEmitter } from 'events';
import { WalletInfo, Network, SDKConfig } from '../types.js';
import { NETWORK_CONFIGS } from './config.js';

export type WalletProvider = 'freighter' | 'xbull' | 'albedo' | 'rabet' | 'lobstr';

interface FreighterModule {
  isConnected: () => Promise<{ isConnected: boolean }>;
  getAddress: () => Promise<{ address: string }>;
  signTransaction: (xdr: string, opts?: { networkPassphrase?: string }) => Promise<{ signedTxXdr: string; signerAddress: string; error?: { message: string } } | string>;
  getNetwork: () => Promise<{ network: string; networkPassphrase: string }>;
}

declare global {
  interface Window {
    stellar?: { freighter?: FreighterModule };
  }
}

export class WalletManager extends EventEmitter {
  private provider: WalletProvider = 'freighter';
  private walletInfo: WalletInfo | null = null;
  private config: SDKConfig;

  constructor(config: Partial<SDKConfig> = {}) {
    super();
    this.config = {
      network: config.network || NETWORK_CONFIGS[Network.TESTNET],
      storageProvider: config.storageProvider,
    };
  }

  getWalletInfo(): WalletInfo | null {
    return this.walletInfo;
  }

  isConnected(): boolean {
    return this.walletInfo?.isConnected ?? false;
  }

  setProvider(provider: WalletProvider): void {
    this.provider = provider;
  }

  /** Keep the wallet's network in sync when the client switches networks. */
  setNetwork(network: Network): void {
    if (network === this.config.network.network) return;
    this.config.network = NETWORK_CONFIGS[network];
  }

  async isFreighterInstalled(): Promise<boolean> {
    try {
      const freighter = await import('@stellar/freighter-api');
      return freighter && typeof freighter.isConnected === 'function';
    } catch {
      return false;
    }
  }

  async connect(provider?: WalletProvider): Promise<WalletInfo> {
    if (provider) this.provider = provider;

    if (this.provider === 'freighter') {
      return this.connectFreighter();
    }
    throw new Error(`Provider ${this.provider} not yet supported`);
  }

  private async getFreighterModule(): Promise<FreighterModule> {
    if (window.stellar?.freighter) {
      return window.stellar.freighter;
    }
    return import('@stellar/freighter-api');
  }

  private async connectFreighter(): Promise<WalletInfo> {
    try {
      const freighter = await this.getFreighterModule();
      const connected = await freighter.isConnected();
      if (!connected.isConnected) {
        throw new Error('Freighter is not connected. Please unlock Freighter.');
      }

      const addressResult = await freighter.getAddress();
      const publicKey = addressResult.address;
      if (!publicKey) {
        throw new Error('Failed to get public key from Freighter');
      }

      const networkInfo = await freighter.getNetwork();
      const network = this.parseNetwork(networkInfo.network);

      this.walletInfo = {
        publicKey,
        network,
        isConnected: true,
      };

      this.emit('onWalletConnected', this.walletInfo);
      return this.walletInfo;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect to Freighter';
      throw new Error(message, { cause: error });
    }
  }

  disconnect(): void {
    this.walletInfo = null;
    this.emit('onWalletDisconnected');
  }

  async signTransaction(xdr: string, networkPassphrase?: string): Promise<string> {
    if (!this.walletInfo) {
      throw new Error('Wallet not connected');
    }

    const freighter = await this.getFreighterModule();
    const result = await freighter.signTransaction(xdr, {
      networkPassphrase: networkPassphrase ?? this.config.network.networkPassphrase,
    });
    if (typeof result === 'string') return result;
    if (result.error) throw new Error(`Transaction signing failed: ${result.error.message}`);
    return result.signedTxXdr;
  }

  async getNetwork(): Promise<{ network: string; networkPassphrase: string }> {
    const freighter = await this.getFreighterModule();
    return freighter.getNetwork();
  }

  private parseNetwork(network: string): Network {
    switch (network.toLowerCase()) {
      case 'public':
      case 'mainnet':
        return Network.PUBLIC;
      case 'testnet':
        return Network.TESTNET;
      case 'futurenet':
        return Network.FUTURENET;
      default:
        return Network.SANDBOX;
    }
  }

  getPublicKey(): string | null {
    return this.walletInfo?.publicKey ?? null;
  }
}
