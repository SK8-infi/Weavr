import { cn } from "../../utils/cn";

/** Shared input chrome, so a one-line field and a paragraph field match. */
export const fieldClasses = (isDirty, isBusy) =>
  cn(
    "w-full resize-none rounded-lg bg-canvas-0 px-3 py-2 text-[13px] leading-relaxed",
    "text-canvas-900 placeholder:text-canvas-400",
    "shadow-panel outline-none transition-[box-shadow,background-color] duration-150",
    "hover:bg-canvas-50",
    "focus:bg-canvas-0 focus:shadow-[0_0_0_1px_var(--color-brand-500),0_0_0_4px_var(--color-brand-100)]",
    // A dirty field keeps a quiet accent ring so unsaved work is visible
    // without shouting.
    isDirty && "shadow-[0_0_0_1px_var(--color-brand-400)]",
    isBusy && "opacity-60",
  );

export function FieldLabel({ children, hint }) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className="truncate text-[11px] font-medium text-canvas-500">
        {children}
      </span>
      {hint && (
        <span className="shrink-0 text-[10px] text-canvas-400">{hint}</span>
      )}
    </span>
  );
}
