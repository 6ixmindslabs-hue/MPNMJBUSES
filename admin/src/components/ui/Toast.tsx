import React from 'react';
import { useStore } from '../../store';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export const ToastContainer = () => {
  const toasts = useStore((state) => state.toasts);
  const removeToast = useStore((state) => state.removeToast);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto bg-gray-900 text-white shadow-lg rounded p-4 flex items-center gap-3 min-w-[320px] animate-fade-in">
          {toast.type === 'success' ? (
            <CheckCircle2 className="text-green-400" size={20} />
          ) : (
            <AlertCircle className="text-red-400" size={20} />
          )}
          <p className="text-sm font-medium flex-1">{toast.message}</p>
          <button onClick={() => removeToast(toast.id)} className="text-gray-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};
