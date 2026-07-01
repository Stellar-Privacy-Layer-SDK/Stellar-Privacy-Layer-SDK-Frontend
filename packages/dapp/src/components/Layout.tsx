import { NavLink, Outlet } from 'react-router-dom';
import {
  Shield,
  Send,
  Key,
  FileSearch,
  History,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { WalletConnect } from './WalletConnect';
import { NetworkSwitcher } from './NetworkSwitcher';
import { ToastContainer } from './ui/Toast';

const navItems = [
  { to: '/', icon: Shield, label: 'Dashboard', end: true },
  { to: '/shielded-transfer', icon: Send, label: 'Shielded Transfer' },
  { to: '/compliance', icon: Key, label: 'Compliance' },
  { to: '/viewing-keys', icon: FileSearch, label: 'Viewing Keys' },
  { to: '/history', icon: History, label: 'History' },
];

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-surface-light border-r border-surface-border/50
                    transform transition-transform duration-200 lg:translate-x-0 lg:static lg:inset-auto
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-5 border-b border-surface-border/50">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-privacy-500 to-stellar-600 flex items-center justify-center">
                <Shield className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white">Stellar Privacy</h1>
                <p className="text-[10px] text-gray-500">Layer SDK</p>
              </div>
            </div>
            <button
              className="lg:hidden btn-ghost p-1"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                   ${isActive
                     ? 'bg-privacy-500/10 text-privacy-400 border border-privacy-500/20'
                     : 'text-gray-400 hover:text-gray-200 hover:bg-surface-lighter'
                   }`
                }
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="px-4 py-4 border-t border-surface-border/50">
            <p className="text-[10px] text-gray-600 text-center">
              Protocol 25 · BN254 · Poseidon
            </p>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 glass border-b border-surface-border/50">
          <div className="flex items-center justify-between px-4 lg:px-6 py-3">
            <button
              className="lg:hidden btn-ghost p-1"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <NetworkSwitcher />
              <WalletConnect />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}
