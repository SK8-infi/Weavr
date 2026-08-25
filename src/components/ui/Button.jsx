import { cn } from "../../utils/cn";

const VARIANTS = {
  primary:
    "bg-brand-600 text-white shadow-panel hover:bg-brand-700 active:bg-brand-700",
  secondary:
    "bg-canvas-0 text-canvas-800 shadow-panel hover:bg-canvas-50 active:bg-canvas-100",
  ghost: "text-canvas-500 hover:text-canvas-900 hover:bg-canvas-100",
  danger: "bg-critical-600 text-white shadow-panel hover:bg-critical-700",
};

const SIZES = {
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-[13px] gap-2 rounded-lg",
  lg: "h-11 px-5 text-sm gap-2 rounded-xl",
};

export default function Button({
  variant = "secondary",
  size = "md",
  className,
  loading = false,
  disabled,
  children,
  ...props
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center font-medium",
        "transition-[background-color,color,opacity,transform] duration-150 ease-out",
        // A small give on press makes the surface feel physical.
        "active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-70"
    />
  );
}
