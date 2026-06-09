import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps { variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'; className?: string; children: ReactNode }

export function Badge({ variant = 'default', className, children }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', {
      'bg-gray-700 text-gray-300': variant === 'default',
      'bg-emerald-500/20 text-emerald-400': variant === 'success',
      'bg-amber-500/20 text-amber-400': variant === 'warning',
      'bg-red-500/20 text-red-400': variant === 'danger',
      'bg-sky-500/20 text-sky-400': variant === 'info',
    }, className)}>
      {children}
    </span>
  );
}
