import { useWallet } from '../hooks/useSDK';
import { LoadingSpinner } from './ui/LoadingSpinner';
import { truncateAddress } from '@stellar-privacy/sdk';
import { Wallet, LogOut } from 'lucide-react';

export function WalletConnect() {
  const { walletInfo, isConnecting, error, connect, disconnect } = useWallet();

  if (walletInfo?.isConnected) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-privacy-500/10 border border-privacy-500/20">
          <div className="h-2 w-2 rounded-full bg-privacy-400 animate-pulse-slow" />
          <span className="text-xs font-mono text-privacy-400">
            {truncateAddress(walletInfo.publicKey, 6)}
          </span>
        </div>
        <button onClick={disconnect} className="btn-ghost text-xs gap-1.5" title="Disconnect">
          <LogOut className="h-3.5 w-3.5" />
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-400">{error}</span>}
      <button
        onClick={connect}
        disabled={isConnecting}
        className="btn-primary text-xs gap-2"
      >
        {isConnecting ? (
          <>
            <LoadingSpinner size="sm" />
            Connecting...
          </>
        ) : (
          <>
            <Wallet className="h-3.5 w-3.5" />
            Connect Freighter
          </>
        )}
      </button>
    </div>
  );
}
