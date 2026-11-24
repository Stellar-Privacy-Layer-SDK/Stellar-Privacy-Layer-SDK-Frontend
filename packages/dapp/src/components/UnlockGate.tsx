import { useEffect, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import {
  createLocalStorageProvider,
  hasEncryptedStorage,
  unlockEncryptedStorage,
} from '@stellar-privacy/sdk';
import { setSDKStorage } from '../hooks/useSDK';

const MIN_LENGTH = 10;

/** Asks for the password that encrypts notes and keys before showing the app. */
export function UnlockGate({ children }: { children: ReactNode }) {
  const [inner] = useState(() => createLocalStorageProvider());
  const [exists, setExists] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void hasEncryptedStorage(inner).then(setExists);
  }, [inner]);

  if (unlocked) return children;
  if (exists === null) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exists && password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters`);
      return;
    }
    if (!exists && password !== confirmation) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setSDKStorage(await unlockEncryptedStorage(inner, password));
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="card card-body w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-privacy-400" />
          <h1 className="text-lg font-semibold text-white">
            {exists ? 'Unlock' : 'Choose a password'}
          </h1>
        </div>
        {!exists && (
          <p className="text-xs text-gray-400">
            It encrypts your notes and keys in this browser. It cannot be recovered, so keep note
            backups too.
          </p>
        )}
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete={exists ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
          />
        </div>
        {!exists && (
          <div>
            <label className="label" htmlFor="confirmation">Confirm password</label>
            <input
              id="confirmation"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="input-field"
            />
          </div>
        )}
        {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {exists ? 'Unlock' : 'Continue'}
        </button>
      </form>
    </main>
  );
}
