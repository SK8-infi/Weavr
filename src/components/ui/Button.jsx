import { cn } from "../../utils/cn";

const VARIANTS = {
  primary: cn(
    "bg-brand-gradient text-white shadow-accent",
    // A top highlight suggests a lit surface rather than a flat fill.
    "[box-shadow:var(--shadow-accent),var(--shadow-inset-top)]",
    "hover:brightness-[1.07]",
  ),
  secondary:
    "bg-canvas-0 text-canvas-800 shadow-panel hover:shadow-raised hover:-translate-y-px",
  ghost: "text-canvas-500 hover:text-canvas-900 hover:bg-canvas-200/60",
  danger: "bg-critical-600 text-white shadow-panel hover:bg-critical-700",
};

const SIZES = {
  icon: "h-7 w-7 rounded-lg",
  sm: "h-7 gap-1.5 rounded-lg px-2.5 text-xs",
  md: "h-9 gap-2 rounded-[10px] px-3.5 text-[13px]",
  lg: "h-11 gap-2 rounded-xl px-5 text-sm",
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
        "transition-all duration-200 ease-[var(--ease-out-soft)]",
        // A small give on press makes the surface feel physical.
        "active:translate-y-0 active:scale-[0.97]",
        "disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none",
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
      className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-80"
    />
  );
}
