import { useState } from 'react';
import { Network } from '@stellar-privacy/sdk';
import { useNetwork } from '../hooks/useSDK';
import { Globe } from 'lucide-react';

const NETWORKS: { value: Network; label: string }[] = [
  { value: Network.PUBLIC, label: 'Mainnet' },
  { value: Network.TESTNET, label: 'Testnet' },
  { value: Network.FUTURENET, label: 'Futurenet' },
  { value: Network.SANDBOX, label: 'Sandbox' },
];

export function NetworkSwitcher() {
  const { network, switchNetwork } = useNetwork();
  const [open, setOpen] = useState(false);

  const current = NETWORKS.find((n) => n.value === network) ?? NETWORKS[1];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="btn-ghost text-xs gap-1.5"
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{current.label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-36 py-1 rounded-lg bg-surface-light 
                          border border-surface-border/50 shadow-xl shadow-black/20">
            {NETWORKS.map((n) => (
              <button
                key={n.value}
                onClick={() => { switchNetwork(n.value); setOpen(false); }}
                className={`w-full px-3 py-1.5 text-xs text-left transition-colors
                  ${n.value === network
                    ? 'text-privacy-400 bg-privacy-500/10'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-surface-lighter'
                  }`}
              >
                {n.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
