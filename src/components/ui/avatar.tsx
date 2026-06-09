import { cn } from '../../lib/utils';

interface AvatarProps { src?: string; fallback: string; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }

export function Avatar({ src, fallback, size = 'md', className }: AvatarProps) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg', xl: 'w-20 h-20 text-2xl' };
  const initials = fallback.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  if (src) return <img src={src} alt={fallback} className={cn('rounded-full object-cover border-2 border-white/20', sizes[size], className)} />;

  return (
    <div className={cn('rounded-full flex items-center justify-center font-bold bg-gradient-to-br from-emerald-500 to-teal-600 text-white', sizes[size], className)}>
      {initials}
    </div>
  );
}
