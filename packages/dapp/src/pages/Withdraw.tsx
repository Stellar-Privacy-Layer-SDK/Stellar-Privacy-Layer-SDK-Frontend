import { useState } from 'react';
import { ArrowUpFromLine, Loader2, Shield } from 'lucide-react';
import { isValidPublicKey, truncateAddress } from '@stellar-privacy/sdk';
import { useNavigate } from 'react-router';
import { useShieldedTransfer, useWallet } from '../hooks/useSDK';
import { toast } from '../components/ui/Toast';

export function Withdraw() {
  const { walletInfo } = useWallet();
  const { commitments, isProcessing, error, withdraw } = useShieldedTransfer();
  const navigate = useNavigate();
  const [selected, setSelected] = useState('');
  const [recipient, setRecipient] = useState('');
  const [errors, setErrors] = useState<{ commitment?: string; recipient?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const commitment = commitments.find((c) => c.hash === selected);
    const newErrors: typeof errors = {};
    if (!commitment) newErrors.commitment = 'Select a commitment to withdraw';
    if (!isValidPublicKey(recipient)) {
      newErrors.recipient = 'Enter a valid Stellar public key (G...)';
    }
    setErrors(newErrors);
    if (!commitment || newErrors.recipient) return;

    try {
      await withdraw(commitment, recipient);
      toast('success', 'Withdrawal submitted');
      navigate('/history');
    } catch (err) {
      toast('error', 'Withdrawal failed', err instanceof Error ? err.message : undefined);
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
        <p className="text-sm text-gray-400 mt-1">Spend a shielded commitment</p>
      </div>

      {commitments.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-gray-400">No commitments to withdraw</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card card-body space-y-5">
          <fieldset className="space-y-2">
            <legend className="label">Commitment</legend>
            {commitments.map((c) => (
              <label key={c.hash} className="flex items-center gap-3 p-3 rounded-lg bg-surface cursor-pointer">
                <input
                  type="radio"
                  name="commitment"
                  value={c.hash}
                  checked={selected === c.hash}
                  onChange={() => setSelected(c.hash)}
                />
                <span className="text-sm text-white">
                  {c.amount} {truncateAddress(c.token)}
                </span>
                <span className="text-xs font-mono text-gray-500 ml-auto">
                  {truncateAddress(c.hash, 8)}
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
    </div>
  );
}
