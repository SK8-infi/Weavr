import { cn } from "../../utils/cn";

/**
 * Weavr's mark: two threads crossing over a rounded tile — a weave, and a
 * nod to content and structure being edited together.
 */
export default function WeavrMark({ className }) {
  return (
    <svg
      viewBox="0 0 44 44"
      role="img"
      aria-label="Weavr"
      className={cn("shrink-0", className)}
    >
      <rect width="44" height="44" rx="11" fill="var(--color-brand-600)" />
      <g
        stroke="white"
        strokeWidth="2.75"
        strokeLinecap="round"
        fill="none"
        opacity="0.95"
      >
        <path d="M12 15 L22 29 L32 15" />
        <path d="M12 24 L17 31" opacity="0.55" />
        <path d="M32 24 L27 31" opacity="0.55" />
      </g>
    </svg>
  );
}
