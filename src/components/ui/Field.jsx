import Icon from "./Icon";
import { cn } from "../../utils/cn";

/** Shared input chrome, so a one-line field and a paragraph field match. */
export const fieldClasses = (isDirty, isBusy) =>
  cn(
    "w-full resize-none rounded-[10px] bg-canvas-50 px-3 py-2 text-[13px] leading-relaxed",
    "text-canvas-900 placeholder:text-canvas-400",
    "outline-none transition-all duration-200",
    "shadow-[inset_0_0_0_1px_var(--color-canvas-200)]",
    "hover:shadow-[inset_0_0_0_1px_var(--color-canvas-300)]",
    "focus:shadow-[inset_0_0_0_1.5px_var(--color-brand-500),0_0_0_4px_rgba(124,108,255,0.16)]",
    // Unsaved work keeps a quiet accent edge rather than shouting.
    isDirty && "shadow-[inset_0_0_0_1.5px_var(--color-brand-300)]",
    isBusy && "opacity-60",
  );

export function FieldLabel({ children, hint }) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className="truncate text-[11px] font-medium tracking-wide text-canvas-500">
        {children}
      </span>
      {hint && (
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-brand-400">
          <span className="h-1 w-1 rounded-full bg-brand-400" />
          {hint}
        </span>
      )}
    </span>
  );
}

/** A rounded search box with the icon inset, used at the top of each panel. */
export function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Icon
        name="search"
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-canvas-400"
      />
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-[10px] bg-canvas-0 py-2 pl-9 pr-3 text-[13px] text-canvas-900",
          "outline-none transition-all duration-200",
          "shadow-[inset_0_0_0_1px_var(--color-canvas-200)]",
          "placeholder:text-canvas-400",
          "hover:shadow-[inset_0_0_0_1px_var(--color-canvas-300)]",
          "focus:shadow-[inset_0_0_0_1.5px_var(--color-brand-500),0_0_0_4px_rgba(124,108,255,0.16)]",
        )}
      />
    </div>
  );
}
