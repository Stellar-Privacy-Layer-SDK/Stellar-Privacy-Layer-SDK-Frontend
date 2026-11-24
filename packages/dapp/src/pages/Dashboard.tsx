import { useState } from 'react';
import { Shield, Send, Key, FileSearch, ArrowRight, Lock, Eye, Coins } from 'lucide-react';
import { usePool, useViewingKeys, useWallet } from '../hooks/useSDK';
import { useNavigate } from 'react-router';

const quickActions = [
  {
    title: 'New Deposit',
    description: 'Move assets into the shielded pool',
    icon: Send,
    path: '/deposit',
    color: 'from-privacy-500 to-emerald-600',
  },
  {
    title: 'Manage Viewing Keys',
    description: 'Grant or revoke regulatory access',
    icon: Key,
    path: '/viewing-keys',
    color: 'from-stellar-500 to-blue-600',
  },
  {
    title: 'Compliance Panel',
    description: 'Selective disclosure for regulators',
    icon: FileSearch,
    path: '/compliance',
    color: 'from-violet-500 to-purple-600',
  },
];

export function Dashboard() {
  const [now] = useState(() => Date.now());
  const { walletInfo } = useWallet();
  const { transactions, notes } = usePool();
  const { keys } = useViewingKeys();
  const navigate = useNavigate();
  const activeKeys = keys.filter((k) => k.active && !(k.expiresAt && k.expiresAt < now));
  const stats = [
    { label: 'Total Shielded Transactions', value: transactions.length, icon: Lock, color: 'text-privacy-400' },
    { label: 'Active Viewing Keys', value: activeKeys.length, icon: Eye, color: 'text-stellar-400' },
    { label: 'Unspent Notes', value: notes.filter((n) => n.status !== 'spent').length, icon: Coins, color: 'text-yellow-400' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-1">
          Stellar Privacy Layer — Confidential Transfers SDK
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-5">
            <div className="flex items-center gap-3">
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
              <span className="text-sm text-gray-400">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-white mt-2">{stat.value}</p>
          </div>
        ))}
      </div>

      {!walletInfo?.isConnected ? (
        <div className="card p-12 text-center">
          <Shield className="h-12 w-12 text-privacy-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">Welcome to Stellar Privacy Layer</h2>
          <p className="text-sm text-gray-400 max-w-md mx-auto mb-6">
            Connect your Freighter wallet to start making private, compliant transactions
            using Stellar Protocol 25 ZK primitives.
          </p>
          <div className="flex flex-wrap gap-3 justify-center text-xs text-gray-500">
            <span className="px-3 py-1 rounded-full bg-surface-lighter">BN254</span>
            <span className="px-3 py-1 rounded-full bg-surface-lighter">Poseidon Hash</span>
            <span className="px-3 py-1 rounded-full bg-surface-lighter">Protocol 25</span>
            <span className="px-3 py-1 rounded-full bg-surface-lighter">Groth16</span>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickActions.map((action) => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className="card p-5 text-left group hover:border-privacy-500/30 transition-all duration-200"
              >
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${action.color} 
                               flex items-center justify-center mb-3`}>
                  <action.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-medium text-white group-hover:text-privacy-400 transition-colors">
                  {action.title}
                </h3>
                <p className="text-xs text-gray-400 mt-1">{action.description}</p>
                <ArrowRight className="h-4 w-4 text-gray-600 mt-3 group-hover:text-privacy-400 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Protocol Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-surface">
            <span className="text-gray-500">ZK Curve</span>
            <p className="text-gray-200 font-mono mt-0.5">BN254</p>
          </div>
          <div className="p-3 rounded-lg bg-surface">
            <span className="text-gray-500">Hash Function</span>
            <p className="text-gray-200 font-mono mt-0.5">Poseidon</p>
          </div>
          <div className="p-3 rounded-lg bg-surface">
            <span className="text-gray-500">Proof System</span>
            <p className="text-gray-200 font-mono mt-0.5">Groth16</p>
          </div>
          <div className="p-3 rounded-lg bg-surface">
            <span className="text-gray-500">Protocol</span>
            <p className="text-gray-200 font-mono mt-0.5">Stellar Protocol 25</p>
          </div>
        </div>
      </div>
    </div>
  );
}
