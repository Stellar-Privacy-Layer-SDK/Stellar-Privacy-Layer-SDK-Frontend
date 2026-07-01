import { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

let addToastFn: ((toast: Omit<ToastMessage, 'id'>) => void) | null = null;

export function toast(type: ToastType, title: string, message?: string, duration?: number) {
  if (addToastFn) {
    addToastFn({ type, title, message, duration });
  }
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const colors = {
  success: 'border-privacy-500/30 bg-privacy-500/10',
  error: 'border-red-500/30 bg-red-500/10',
  info: 'border-stellar-500/30 bg-stellar-500/10',
  warning: 'border-yellow-500/30 bg-yellow-500/10',
};

const iconColors = {
  success: 'text-privacy-400',
  error: 'text-red-400',
  info: 'text-stellar-400',
  warning: 'text-yellow-400',
};

function ToastItem({ t, onClose }: { t: ToastMessage; onClose: (id: string) => void }) {
  const Icon = icons[t.type];

  useEffect(() => {
    const duration = t.duration ?? 5000;
    if (duration > 0) {
      const timer = setTimeout(() => onClose(t.id), duration);
      return () => clearTimeout(timer);
    }
  }, [t, onClose]);

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${colors[t.type]} 
                 shadow-lg backdrop-blur-xl animate-slide-up min-w-[320px] max-w-md`}
    >
      <Icon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${iconColors[t.type]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-100">{t.title}</p>
        {t.message && <p className="text-xs text-gray-400 mt-0.5">{t.message}</p>}
      </div>
      <button onClick={() => onClose(t.id)} className="text-gray-500 hover:text-gray-300 flex-shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((t: Omit<ToastMessage, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-4), { ...t, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
  }, [addToast]);

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} onClose={removeToast} />
      ))}
    </div>
  );
}
