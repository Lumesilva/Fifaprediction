import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface CardProps { className?: string; children: ReactNode; glass?: boolean }

export function Card({ className, children, glass = true }: CardProps) {
  return <div className={cn('rounded-2xl border border-white/10', glass && 'bg-white/5 backdrop-blur-xl', !glass && 'bg-gray-800/50', className)}>{children}</div>;
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-6 py-4 border-b border-white/5', className)}>{children}</div>;
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-6 py-4', className)}>{children}</div>;
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h3 className={cn('text-lg font-bold text-white', className)}>{children}</h3>;
}
