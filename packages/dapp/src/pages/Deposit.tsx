import { useEffect, useState } from 'react';
import { ArrowDownToLine, Loader2, Shield } from 'lucide-react';
import { formatUnits, truncateAddress, type Note, type PoolInfo } from '@stellar-privacy/sdk';
import { usePool, useSDK, useWallet } from '../hooks/useSDK';
import { CopyButton } from '../components/ui/CopyButton';
import { toast } from '../components/ui/Toast';

export function Deposit() {
  const { walletInfo } = useWallet();
  const sdk = useSDK();
  const { isProcessing, error, deposit } = usePool();
  const [info, setInfo] = useState<PoolInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const connected = walletInfo?.isConnected ?? false;

  useEffect(() => {
    if (!connected) return;
    let active = true;
    sdk.pool.getInfo().then(
      (value) => active && setInfo(value),
      (e: unknown) => active && setInfoError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      active = false;
    };
  }, [sdk, connected]);

  const handleDeposit = async () => {
    try {
      setNote((await deposit()).note);
      toast('success', 'Deposit submitted');
    } catch (err) {
      toast('error', 'Deposit failed', err instanceof Error ? err.message : undefined);
    }
  };

  if (!connected) {
    return (
      <div className="card p-12 text-center">
        <Shield className="h-12 w-12 text-privacy-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-sm text-gray-400">Connect to deposit into the shielded pool.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Deposit</h1>
        <p className="text-sm text-gray-400 mt-1">
          Every deposit in a pool is the same size, so amounts cannot link it to a withdrawal.
        </p>
      </div>

      <div className="card card-body space-y-4">
        {info && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-gray-400">Amount</dt>
            <dd className="text-white">{formatUnits(info.denomination, info.decimals)}</dd>
            <dt className="text-gray-400">Token</dt>
            <dd className="text-white font-mono">{truncateAddress(info.token)}</dd>
            <dt className="text-gray-400">Deposits in pool</dt>
            <dd className="text-white">{info.depositCount}</dd>
          </dl>
        )}
        {infoError && <p className="text-xs text-red-400">Pool unavailable: {infoError}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={handleDeposit}
          disabled={!info || isProcessing}
          className="btn-primary w-full gap-2"
        >
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
          {isProcessing ? 'Depositing...' : 'Deposit'}
        </button>
      </div>

      {note && (
        <div className="card card-body space-y-2" role="status">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-white">Back up your note</h2>
            <CopyButton text={sdk.pool.exportNote(note.commitment)} />
          </div>
          <p className="text-xs text-yellow-400">
            Copy it somewhere safe. If this browser's data or your password is lost, only the
            backup can recover the deposit. Anyone who has it can withdraw.
          </p>
        </div>
      )}
    </div>
  );
}
