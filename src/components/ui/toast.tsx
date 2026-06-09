import type { Toast } from '../../hooks/useToast';
import { CheckCircle, XCircle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ToastContainerProps {
  toasts: Toast[];
}

/** Fixed-position toast container — rendered once in AppLayout. */
export function ToastContainer({ toasts }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium pointer-events-auto',
            'animate-in slide-in-from-bottom-4 fade-in duration-300',
            t.type === 'success' && 'bg-emerald-500 text-black',
            t.type === 'error' && 'bg-red-500 text-white',
            t.type === 'info' && 'bg-sky-500 text-white',
          )}
        >
          {t.type === 'success' && <CheckCircle className="w-4 h-4 flex-shrink-0" />}
          {t.type === 'error' && <XCircle className="w-4 h-4 flex-shrink-0" />}
          {t.type === 'info' && <Info className="w-4 h-4 flex-shrink-0" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}
