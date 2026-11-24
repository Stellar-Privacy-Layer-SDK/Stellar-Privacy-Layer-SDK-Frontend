import { useState } from 'react';
import { ArrowUpFromLine, Loader2, Shield } from 'lucide-react';
import { isValidPublicKey, truncateAddress } from '@stellar-privacy/sdk';
import { useNavigate } from 'react-router';
import { usePool, useWallet } from '../hooks/useSDK';
import { toast } from '../components/ui/Toast';

export function Withdraw() {
  const { walletInfo } = useWallet();
  const { notes, isProcessing, error, withdraw, importNote } = usePool();
  const spendable = notes.filter((n) => n.status !== 'spent' && n.status !== 'spending');
  const [backup, setBackup] = useState('');
  const navigate = useNavigate();
  const [selected, setSelected] = useState('');
  const [recipient, setRecipient] = useState('');
  const [errors, setErrors] = useState<{ commitment?: string; recipient?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const note = notes.find((n) => n.commitment === selected);
    const newErrors: typeof errors = {};
    if (!note) newErrors.commitment = 'Select a note to withdraw';
    if (!isValidPublicKey(recipient)) {
      newErrors.recipient = 'Enter a valid Stellar public key (G...)';
    }
    setErrors(newErrors);
    if (!note || newErrors.recipient) return;

    try {
      await withdraw(note, recipient);
      toast('success', 'Withdrawal submitted');
      navigate('/history');
    } catch (err) {
      toast('error', 'Withdrawal failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await importNote(backup);
      setBackup('');
      toast('success', 'Note restored');
    } catch (err) {
      toast('error', 'Restore failed', err instanceof Error ? err.message : undefined);
    }
  };

  if (!walletInfo?.isConnected) {
    return (
      <div className="card p-12 text-center">
        <Shield className="h-12 w-12 text-privacy-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-sm text-gray-400">Connect to withdraw shielded assets.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Withdraw</h1>
        <p className="text-sm text-gray-400 mt-1">Use a fresh recipient account: withdrawing to the depositing account links the two.</p>
      </div>

      {spendable.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-gray-400">No notes to withdraw</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card card-body space-y-5">
          <fieldset className="space-y-2">
            <legend className="label">Note</legend>
            {spendable.map((c) => (
              <label key={c.commitment} className="flex items-center gap-3 p-3 rounded-lg bg-surface cursor-pointer">
                <input
                  type="radio"
                  name="commitment"
                  value={c.commitment}
                  checked={selected === c.commitment}
                  onChange={() => setSelected(c.commitment)}
                />
                <span className="text-sm text-white">
                  {c.amount} {truncateAddress(c.token)}
                </span>
                <span className="text-xs font-mono text-gray-500 ml-auto">
                  {c.status === 'unconfirmed' ? 'unconfirmed' : truncateAddress(c.commitment, 8)}
                </span>
              </label>
            ))}
            {errors.commitment && <p className="text-xs text-red-400">{errors.commitment}</p>}
          </fieldset>

          <div>
            <label className="label" htmlFor="withdraw-recipient">Recipient (G...)</label>
            <input
              id="withdraw-recipient"
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              className="input-field font-mono text-xs"
            />
            {errors.recipient && <p className="text-xs text-red-400 mt-1">{errors.recipient}</p>}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button type="submit" disabled={isProcessing} className="btn-primary w-full gap-2">
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUpFromLine className="h-4 w-4" />
            )}
            {isProcessing ? 'Withdrawing...' : 'Withdraw'}
          </button>
        </form>
      )}

      <form onSubmit={handleImport} className="card card-body space-y-3">
        <label className="label" htmlFor="note-backup">Restore a note backup</label>
        <input
          id="note-backup"
          type="password"
          autoComplete="off"
          value={backup}
          onChange={(e) => setBackup(e.target.value)}
          className="input-field font-mono text-xs"
        />
        <button type="submit" disabled={!backup || isProcessing} className="btn-secondary w-full">
          Restore
        </button>
      </form>
    </div>
  );
}
