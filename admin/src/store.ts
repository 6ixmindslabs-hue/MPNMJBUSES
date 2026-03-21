import { create } from 'zustand';

interface Toast {
  message: string;
  type: 'success' | 'error';
  id: number;
}

interface AppState {
  activeTab: 'Driver' | 'Bus' | 'Route' | 'Stops' | 'Schedule';
  setActiveTab: (tab: 'Driver' | 'Bus' | 'Route' | 'Stops' | 'Schedule') => void;
  toasts: Toast[];
  addToast: (message: string, type?: 'success' | 'error') => void;
  removeToast: (id: number) => void;
}

export const useStore = create<AppState>((set) => ({
  activeTab: 'Driver',
  setActiveTab: (tab) => set({ activeTab: tab }),
  toasts: [],
  addToast: (message, type = 'success') => {
    const id = Date.now();
    set((state) => ({ toasts: [...state.toasts, { message, type, id }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
