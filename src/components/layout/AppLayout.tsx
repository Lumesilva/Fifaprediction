import { createContext, useContext } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from './Navbar';
import { ToastContainer } from '../ui/toast';
import { useToast } from '../../hooks/useToast';
import type { ToastType } from '../../hooks/useToast';

interface ToastContextType {
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
}

export const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

/** Access the global toast trigger from any child component. */
export function useAppToast() {
  return useContext(ToastContext);
}

export default function AppLayout() {
  const { user, loading } = useAuth();
  const { toasts, showToast } = useToast();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <ToastContext.Provider value={{ showToast }}>
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <Outlet />
        </main>
        <ToastContainer toasts={toasts} />
      </div>
    </ToastContext.Provider>
  );
}
