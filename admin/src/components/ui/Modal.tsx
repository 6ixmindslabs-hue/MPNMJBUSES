import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  isDestructive?: boolean;
}

export const ConfirmModal = ({ isOpen, onClose, onConfirm, title, description, confirmText = 'Confirm', isDestructive = true }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-md overflow-hidden animate-slide-up">
        <div className="flex items-start justify-between p-6">
          <div className="flex gap-4">
             {isDestructive ? (
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 shrink-0">
                   <AlertTriangle size={20} />
                </div>
             ) : (
                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 shrink-0">
                   <AlertTriangle size={20} />
                </div>
             )}
             <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
             </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
             <X size={20} />
          </button>
        </div>
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">
           <button 
             type="button"
             onClick={onClose} 
             className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
           >
             Cancel
           </button>
           <button 
             type="button"
             onClick={() => { onConfirm(); onClose(); }} 
             className={`px-4 py-2 text-sm font-medium text-white rounded transition-colors focus:ring-2 focus:ring-offset-2 ${
               isDestructive 
                 ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' 
                 : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
             }`}
           >
             {confirmText}
           </button>
        </div>
      </div>
    </div>
  );
};
