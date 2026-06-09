import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, options, className, ...props }: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-gray-300">{label}</label>}
      <select className={cn('w-full px-4 py-2.5 rounded-lg bg-gray-800/50 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 appearance-none cursor-pointer', className)} {...props}>
        {options.map((o) => <option key={o.value} value={o.value} className="bg-gray-800">{o.label}</option>)}
      </select>
    </div>
  );
}
