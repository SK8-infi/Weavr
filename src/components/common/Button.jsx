import { cn } from '../../utils/cn';

export default function Button({
  children,
  variant = 'primary', // 'primary' | 'secondary' | 'ghost' | 'danger'
  size = 'md', // 'sm' | 'md' | 'lg'
  icon: Icon,
  className,
  disabled,
  onClick,
  ...props
}) {
  const baseStyles = 'inline-flex items-center justify-center font-bold rounded-xl transition-all shadow-2xs focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer';

  const variants = {
    primary: 'bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-neutral-950 shadow-md',
    secondary: 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700',
    ghost: 'bg-transparent hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100',
    danger: 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/60',
  };

  const sizes = {
    sm: 'text-[11px] px-2.5 py-1 gap-1.5',
    md: 'text-xs px-3.5 py-2 gap-2',
    lg: 'text-sm px-5 py-2.5 gap-2.5',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {Icon && <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', size === 'lg' && 'w-4 h-4')} />}
      <span>{children}</span>
    </button>
  );
}
