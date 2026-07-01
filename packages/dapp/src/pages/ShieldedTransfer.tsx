import { useState } from 'react';
import { Send, ArrowDown, Shield, Loader2, CheckCircle } from 'lucide-react';
import { useWallet, useShieldedTransfer } from '../hooks/useSDK';
import { useNavigate } from 'react-router-dom';
import { toast } from '../components/ui/Toast';
import { CopyButton } from '../components/ui/CopyButton';
import { isValidPublicKey, isValidAmount } from '@stellar-privacy/sdk';

const SUPPORTED_TOKENS = [
  { symbol: 'USDC', name: 'USD Coin', contract: '...', decimals: 7 },
  { symbol: 'XLM', name: 'Stellar Lumens', contract: 'native', decimals: 7 },
];

export function ShieldedTransfer() {
  const { walletInfo } = useWallet();
  const { isProcessing, error, deposit } = useShieldedTransfer();
  const navigate = useNavigate();

  const [step, setStep] = useState<'form' | 'processing' | 'complete'>('form');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [token, setToken] = useState(SUPPORTED_TOKENS[0].symbol);
  const [memo, setMemo] = useState('');
  const [result, setResult] = useState<{ txHash: string; commitmentHash: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!amount || !isValidAmount(amount)) {
      newErrors.amount = 'Enter a valid amount (0 < amount ≤ 9,999,999,999)';
    }
    if (!recipient || !isValidPublicKey(recipient)) {
      newErrors.recipient = 'Enter a valid Stellar public key (G...)';
    }
    if (memo && memo.length > 28) {
      newErrors.memo = 'Memo must be 28 characters or less';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setStep('processing');
    try {
      const res = await deposit(amount, token, recipient, memo || undefined);
      setResult({ txHash: res.txHash, commitmentHash: res.commitmentHash });
      setStep('complete');
      toast('success', 'Shielded transfer submitted', 'Your transaction has been sent to the network.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transfer failed';
      toast('error', 'Transfer failed', msg);
      setStep('form');
    }
  };

  if (!walletInfo?.isConnected) {
    return (
      <div className="card p-12 text-center">
        <Shield className="h-12 w-12 text-privacy-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-sm text-gray-400 mb-6">
          Connect your Freighter wallet to make shielded transfers.
        </p>
        <button onClick={() => navigate('/')} className="btn-primary">
          Go to Dashboard
        </button>
      </div>
    );
  }

  if (step === 'complete' && result) {
    return (
      <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
        <div className="card p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-privacy-500/10 border border-privacy-500/20 
                          flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-privacy-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Transfer Submitted</h2>
          <p className="text-sm text-gray-400 mb-6">
            Your shielded transfer has been submitted to the network.
            The proof has been generated and verified.
          </p>

          <div className="space-y-3 text-left">
            <div className="p-3 rounded-lg bg-surface">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Transaction Hash</span>
                <CopyButton text={result.txHash} />
              </div>
              <p className="text-xs font-mono text-gray-300 mt-1 break-all">{result.txHash}</p>
            </div>
            <div className="p-3 rounded-lg bg-surface">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Commitment Hash</span>
                <CopyButton text={result.commitmentHash} />
              </div>
              <p className="text-xs font-mono text-gray-300 mt-1 break-all">{result.commitmentHash}</p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={() => { setStep('form'); setAmount(''); setRecipient(''); setMemo(''); setResult(null); }}
                    className="btn-primary flex-1">
              New Transfer
            </button>
            <button onClick={() => navigate('/history')} className="btn-secondary flex-1">
              View History
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Shielded Transfer</h1>
        <p className="text-sm text-gray-400 mt-1">
          Send assets privately using ZK proofs
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-privacy-400" />
            <span className="text-sm font-medium text-white">New Shielded Transfer</span>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="card-body space-y-5">
          <div>
            <label className="label">Token</label>
            <div className="flex gap-2">
              {SUPPORTED_TOKENS.map((t) => (
                <button
                  key={t.symbol}
                  type="button"
                  onClick={() => setToken(t.symbol)}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all
                    ${token === t.symbol
                      ? 'bg-privacy-500/10 border-privacy-500/30 text-privacy-400'
                      : 'bg-surface border-surface-border text-gray-400 hover:border-surface-border/70'
                    }`}
                >
                  {t.symbol}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Amount</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={`input-field font-mono text-lg ${errors.amount ? 'border-red-500/50' : ''}`}
            />
            {errors.amount && <p className="text-xs text-red-400 mt-1">{errors.amount}</p>}
          </div>

          <div className="flex justify-center">
            <div className="p-2 rounded-full bg-surface-lighter">
              <ArrowDown className="h-4 w-4 text-gray-400" />
            </div>
          </div>

          <div>
            <label className="label">Recipient (G...)</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              className={`input-field font-mono text-xs ${errors.recipient ? 'border-red-500/50' : ''}`}
            />
            {errors.recipient && <p className="text-xs text-red-400 mt-1">{errors.recipient}</p>}
          </div>

          <div>
            <label className="label">Memo (optional)</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value.slice(0, 28))}
              placeholder="Reference"
              className={`input-field ${errors.memo ? 'border-red-500/50' : ''}`}
            />
            {errors.memo && <p className="text-xs text-red-400 mt-1">{errors.memo}</p>}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isProcessing}
            className="btn-primary w-full gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating Proof & Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Submit Shielded Transfer
              </>
            )}
          </button>
        </form>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-medium text-white mb-2">How it works</h3>
        <div className="space-y-2 text-xs text-gray-400">
          <p>1. You specify the amount, token, and recipient</p>
          <p>2. The SDK generates a ZK proof using BN254 + Poseidon (Protocol 25)</p>
          <p>3. The proof is verified both locally and on-chain</p>
          <p>4. A commitment is stored on Soroban — details remain private</p>
          <p>5. Compliance viewing keys can selectively disclose tx details</p>
        </div>
      </div>
    </div>
  );
}
