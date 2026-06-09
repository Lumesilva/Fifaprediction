import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export function Input({ label, error, icon, className, ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-gray-300">{label}</label>}
      <div className="relative">
        {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">{icon}</div>}
        <input
          className={cn(
            'w-full px-4 py-2.5 rounded-lg bg-gray-800/50 border border-white/10 text-white placeholder-gray-500',
            'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200',
            icon && 'pl-10', error && 'border-red-500 focus:ring-red-500', className
          )}
          {...props}
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
