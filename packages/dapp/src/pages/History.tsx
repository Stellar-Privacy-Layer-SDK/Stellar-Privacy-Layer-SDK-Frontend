import { History as HistoryIcon, Shield, Send, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useWallet, useShieldedTransfer } from '../hooks/useSDK';
import { CopyButton } from '../components/ui/CopyButton';
import { truncateAddress } from '@stellar-privacy/sdk';
import { useNavigate } from 'react-router-dom';

const statusConfig = {
  pending: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Pending' },
  confirmed: { icon: CheckCircle, color: 'text-privacy-400', bg: 'bg-privacy-500/10', label: 'Confirmed' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Failed' },
};

export function TransactionHistory() {
  const { walletInfo } = useWallet();
  const { transactions } = useShieldedTransfer();
  const navigate = useNavigate();

  if (!walletInfo?.isConnected) {
    return (
      <div className="card p-12 text-center">
        <HistoryIcon className="h-12 w-12 text-gray-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-sm text-gray-400">Connect to view transaction history.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Transaction History</h1>
          <p className="text-sm text-gray-400 mt-1">
            Your shielded transaction records
          </p>
        </div>
        <button onClick={() => navigate('/shielded-transfer')} className="btn-primary text-xs gap-1.5">
          <Send className="h-3.5 w-3.5" />
          New Transfer
        </button>
      </div>

      {transactions.length === 0 ? (
        <div className="card p-12 text-center">
          <Shield className="h-8 w-8 text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No transactions yet</p>
          <p className="text-xs text-gray-600 mt-1">
            Your first shielded transfer will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => {
            const status = statusConfig[tx.status];
            const StatusIcon = status.icon;

            return (
              <div key={tx.txHash} className="card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg ${status.bg} flex items-center justify-center flex-shrink-0`}>
                      <StatusIcon className={`h-4 w-4 ${status.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {tx.amount} {tx.token}
                        </span>
                        <span className={`badge ${status.bg} ${status.color} text-[10px]`}>
                          {status.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500">To:</span>
                          <span className="text-[10px] font-mono text-gray-400">
                            {truncateAddress(tx.recipient, 6)}
                          </span>
                          <CopyButton text={tx.recipient} />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-500">Commitment:</span>
                          <span className="text-[10px] font-mono text-gray-400">
                            {truncateAddress(tx.commitmentHash, 8)}
                          </span>
                          <CopyButton text={tx.commitmentHash} />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                        <span className="text-[10px] text-gray-500">
                          {new Date(tx.timestamp).toLocaleString()}
                        </span>
                        {tx.blockNumber && (
                          <span className="text-[10px] text-gray-500">
                            Block #{tx.blockNumber}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <CopyButton text={tx.txHash} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
