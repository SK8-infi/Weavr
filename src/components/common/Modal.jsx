import { X } from 'lucide-react';
import { cn } from '../../utils/cn';

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className={cn('bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4', className)}>
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <h3 className="text-sm font-black text-neutral-100 uppercase tracking-wider">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
