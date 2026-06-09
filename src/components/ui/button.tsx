import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed',
        {
          'bg-emerald-500 hover:bg-emerald-400 text-black focus:ring-emerald-500': variant === 'primary',
          'bg-gray-700 hover:bg-gray-600 text-white focus:ring-gray-500': variant === 'secondary',
          'bg-transparent hover:bg-white/10 text-gray-300 focus:ring-gray-500': variant === 'ghost',
          'bg-red-600 hover:bg-red-500 text-white focus:ring-red-500': variant === 'danger',
        },
        { 'px-3 py-1.5 text-sm': size === 'sm', 'px-4 py-2.5 text-sm': size === 'md', 'px-6 py-3 text-base': size === 'lg' },
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
