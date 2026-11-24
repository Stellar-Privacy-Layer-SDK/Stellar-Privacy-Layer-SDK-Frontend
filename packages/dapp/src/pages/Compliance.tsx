import { useState } from 'react';
import { FileSearch, Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import { useWallet, usePool, useSDK } from '../hooks/useSDK';
import { toast } from '../components/ui/Toast';
import { isValidPublicKey } from '@stellar-privacy/sdk';
import { CopyButton } from '../components/ui/CopyButton';

type DisclosureScope = 'full' | 'amount-only' | 'recipient-only';

export function Compliance() {
  const { walletInfo } = useWallet();
  const { transactions } = usePool();
  const sdk = useSDK();

  const [regulatorKey, setRegulatorKey] = useState('');
  const [scope, setScope] = useState<DisclosureScope>('full');
  const [reason, setReason] = useState('');
  const [isDisclosing, setIsDisclosing] = useState(false);
  const [disclosureResult, setDisclosureResult] = useState<string | null>(null);
  const [disclosureJson, setDisclosureJson] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleDisclose = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!regulatorKey || !isValidPublicKey(regulatorKey)) {
      newErrors.regulatorKey = 'Enter a valid Stellar public key';
    }
    if (transactions.length === 0) {
      newErrors.transactions = 'No transactions to disclose';
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsDisclosing(true);
    try {
      const { reference, payloads } = await sdk.selectiveDisclosure.disclose(
        transactions,
        regulatorKey,
        scope,
      );
      setDisclosureJson(JSON.stringify(payloads, null, 2));
      setDisclosureResult(reference);
      toast('success', 'Disclosure prepared', 'Copy the payload and send it to the regulator privately.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Disclosure failed';
      toast('error', 'Disclosure failed', msg);
    } finally {
      setIsDisclosing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Compliance</h1>
        <p className="text-sm text-gray-400 mt-1">
          Selective disclosure for regulators and auditors
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-stellar-400" />
              <span className="text-sm font-medium text-white">Disclose to Regulator</span>
            </div>
          </div>
          <form onSubmit={handleDisclose} className="card-body space-y-5">
            <div>
              <label className="label">Regulator Public Key</label>
              <input
                type="text"
                value={regulatorKey}
                onChange={(e) => setRegulatorKey(e.target.value)}
                placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                className={`input-field font-mono text-xs ${errors.regulatorKey ? 'border-red-500/50' : ''}`}
              />
              {errors.regulatorKey && (
                <p className="text-xs text-red-400 mt-1">{errors.regulatorKey}</p>
              )}
            </div>

            <div>
              <label className="label">Disclosure Scope</label>
              <div className="grid grid-cols-3 gap-2">
                {(['full', 'amount-only', 'recipient-only'] as DisclosureScope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all
                      ${scope === s
                        ? 'bg-stellar-500/10 border-stellar-500/30 text-stellar-400'
                        : 'bg-surface border-surface-border text-gray-400'
                      }`}
                  >
                    {s === 'full' ? 'Full' : s === 'amount-only' ? 'Amount' : 'Recipient'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Reason for Disclosure</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Regulatory audit Q3 2026"
                className="input-field"
              />
            </div>

            {errors.transactions && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5" />
                  <p className="text-xs text-yellow-400">{errors.transactions}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isDisclosing || !walletInfo?.isConnected}
              className="btn-primary w-full gap-2"
            >
              {isDisclosing ? (
                'Processing Disclosure...'
              ) : (
                <>
                  <Shield className="h-4 w-4" />
                  Prepare Disclosure
                </>
              )}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-privacy-400" />
              <span className="text-sm font-medium text-white">Compliance Info</span>
            </div>
          </div>
          <div className="card-body space-y-4">
            <div className="p-4 rounded-lg bg-surface">
              <h3 className="text-sm font-medium text-white mb-2">Selective Disclosure</h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                Stellar Privacy Layer enables compliance-forward privacy. With viewing keys,
                regulators can see specific transaction details without compromising the
                overall privacy of the system.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-surface">
                <div className="w-8 h-8 rounded-lg bg-stellar-500/10 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-4 w-4 text-stellar-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Full Disclosure</p>
                  <p className="text-xs text-gray-400">Reveal amount and recipient</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-surface">
                <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-4 w-4 text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Amount Only</p>
                  <p className="text-xs text-gray-400">Reveal only the transaction amount</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-surface">
                <div className="w-8 h-8 rounded-lg bg-privacy-500/10 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-4 w-4 text-privacy-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Recipient Only</p>
                  <p className="text-xs text-gray-400">Reveal only the recipient address</p>
                </div>
              </div>
            </div>

            {disclosureResult && (
              <div className="p-3 rounded-lg bg-privacy-500/10 border border-privacy-500/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-privacy-400 font-medium">Disclosure Reference</span>
                  <CopyButton text={disclosureResult} />
                </div>
                <p className="text-xs font-mono text-gray-300 break-all">{disclosureResult}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-400">
                    Payload (nothing is published on-chain)
                  </span>
                  <CopyButton text={disclosureJson} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
