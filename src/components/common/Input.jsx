import { cn } from '../../utils/cn';

export default function Input({
  label,
  error,
  multiline = false,
  className,
  ...props
}) {
  const inputStyles = 'w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 font-semibold focus:outline-none focus:border-amber-500/70 transition-all placeholder:text-neutral-600';

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
          {label}
        </label>
      )}
      {multiline ? (
        <textarea
          rows={4}
          className={cn(inputStyles, 'resize-y', className)}
          {...props}
        />
      ) : (
        <input
          className={cn(inputStyles, className)}
          {...props}
        />
      )}
      {error && <p className="text-[10px] text-rose-400 font-medium">{error}</p>}
    </div>
  );
}
