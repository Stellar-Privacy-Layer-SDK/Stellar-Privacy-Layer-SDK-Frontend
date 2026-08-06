import { useState } from 'react';
import { Key, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { useWallet, useViewingKeys } from '../hooks/useSDK';
import { isDebugEnabled } from '../env';
import { Modal } from '../components/ui/Modal';
import { toast } from '../components/ui/Toast';
import { CopyButton } from '../components/ui/CopyButton';
import { truncateAddress, isValidPublicKey } from '@stellar-privacy/sdk';

type ScopeType = 'full' | 'amount-only' | 'recipient-only';

export function ViewingKeys() {
  const { walletInfo } = useWallet();
  const { keys, createKey, grantKey, revokeKey, getPrivateKey } = useViewingKeys();

  const [showCreate, setShowCreate] = useState(false);
  const [showGrant, setShowGrant] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newScope, setNewScope] = useState<ScopeType>('full');
  const [grantRecipient, setGrantRecipient] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [granting, setGranting] = useState(false);

  const activeKeys = keys.filter((k) => k.active);

  const handleCreate = async () => {
    if (!newLabel.trim()) return;
    setCreating(true);
    try {
      await createKey(newLabel, newScope);
      setShowCreate(false);
      setNewLabel('');
      toast('success', 'Viewing key created');
    } catch {
      toast('error', 'Failed to create key');
    } finally {
      setCreating(false);
    }
  };

  const handleGrant = async () => {
    if (!isValidPublicKey(grantRecipient)) {
      toast('error', 'Invalid public key');
      return;
    }
    setGranting(true);
    try {
      await grantKey(grantRecipient, newScope);
      setShowGrant(false);
      setGrantRecipient('');
      toast('success', 'Viewing key granted');
    } catch {
      toast('error', 'Failed to grant key');
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    try {
      await revokeKey(keyId);
      toast('info', 'Viewing key revoked');
    } catch {
      toast('error', 'Failed to revoke key');
    }
  };

  if (!walletInfo?.isConnected) {
    return (
      <div className="card p-12 text-center">
        <Key className="h-12 w-12 text-stellar-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-sm text-gray-400">Connect to manage viewing keys.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Viewing Keys</h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage regulatory access to transaction details
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowGrant(true)} className="btn-secondary text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Grant Key
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Create Key
          </button>
        </div>
      </div>

      {activeKeys.length === 0 ? (
        <div className="card p-12 text-center">
          <Key className="h-8 w-8 text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No viewing keys yet</p>
          <p className="text-xs text-gray-600 mt-1">
            Create a key to grant regulatory access or manage disclosures.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeKeys.map((key) => (
            <div key={key.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-stellar-500/10 flex items-center justify-center flex-shrink-0">
                    <Key className="h-4 w-4 text-stellar-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white">{key.label}</h3>
                      <span className="badge-info text-[10px]">{key.scope}</span>
                    </div>
                    <p className="text-xs font-mono text-gray-500 mt-1">
                      ID: {truncateAddress(key.id, 8)}
                    </p>
                    <p className="text-xs font-mono text-gray-500">
                      PubKey: {truncateAddress(key.publicKey, 8)}
                    </p>
                    {showPrivateKey === key.id && (
                      <p className="text-xs font-mono text-yellow-400 mt-1 break-all">
                        {isDebugEnabled()
                          ? `PrivKey: ${getPrivateKey(key.id) ?? 'unavailable'}`
                          : 'Private key hidden (enable VITE_DEBUG to reveal)'}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-gray-500">
                        Granted to: {truncateAddress(key.grantedBy, 6)}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        Created: {new Date(key.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowPrivateKey(showPrivateKey === key.id ? null : key.id)}
                    className="btn-ghost p-1.5"
                    title={showPrivateKey === key.id ? 'Hide private key' : 'Show private key'}
                  >
                    {showPrivateKey === key.id ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <CopyButton text={key.publicKey} />
                  <button
                    onClick={() => handleRevoke(key.id)}
                    className="btn-ghost p-1.5 text-red-400 hover:text-red-300"
                    title="Revoke key"
                    aria-label={`Revoke key: ${key.label}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {keys.filter((k) => !k.active).length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-3">Revoked Keys</h2>
          <div className="space-y-2">
            {keys.filter((k) => !k.active).map((key) => (
              <div key={key.id} className="card p-3 opacity-50">
                <div className="flex items-center gap-3">
                  <Key className="h-4 w-4 text-gray-600" />
                  <div>
                    <p className="text-xs text-gray-500">{key.label}</p>
                    <p className="text-[10px] text-gray-600">Revoked</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Viewing Key">
        <div className="space-y-4">
          <div>
            <label className="label">Label</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g., Audit Q3 2026"
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Scope</label>
            <div className="grid grid-cols-3 gap-2">
              {(['full', 'amount-only', 'recipient-only'] as ScopeType[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNewScope(s)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all
                    ${newScope === s
                      ? 'bg-stellar-500/10 border-stellar-500/30 text-stellar-400'
                      : 'bg-surface border-surface-border text-gray-400'
                    }`}
                >
                  {s === 'full' ? 'Full' : s === 'amount-only' ? 'Amount' : 'Recipient'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating} className="btn-primary w-full">
            {creating ? 'Creating...' : 'Create Viewing Key'}
          </button>
        </div>
      </Modal>

      <Modal open={showGrant} onClose={() => setShowGrant(false)} title="Grant Viewing Key">
        <div className="space-y-4">
          <div>
            <label className="label">Recipient Public Key</label>
            <input
              type="text"
              value={grantRecipient}
              onChange={(e) => setGrantRecipient(e.target.value)}
              placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              className="input-field font-mono text-xs"
            />
          </div>
          <div>
            <label className="label">Scope</label>
            <div className="grid grid-cols-3 gap-2">
              {(['full', 'amount-only', 'recipient-only'] as ScopeType[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNewScope(s)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all
                    ${newScope === s
                      ? 'bg-stellar-500/10 border-stellar-500/30 text-stellar-400'
                      : 'bg-surface border-surface-border text-gray-400'
                    }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleGrant} disabled={granting} className="btn-primary w-full">
            {granting ? 'Granting...' : 'Grant Viewing Key'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
