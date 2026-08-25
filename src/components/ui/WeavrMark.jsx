import { cn } from "../../utils/cn";

/**
 * Weavr's mark: interlaced threads on a rounded tile — a weave, and a nod to
 * content and structure being edited together.
 */
export default function WeavrMark({ className }) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="Weavr"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id="weavr-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-400)" />
          <stop offset="100%" stopColor="var(--color-brand-700)" />
        </linearGradient>
      </defs>

      <rect width="48" height="48" rx="13" fill="url(#weavr-tile)" />
      {/* A soft top highlight keeps the tile from looking like flat colour. */}
      <rect
        width="48"
        height="24"
        rx="13"
        fill="white"
        opacity="0.13"
      />

      <g
        stroke="white"
        strokeWidth="2.9"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M13 16 L24 32 L35 16" />
        <path d="M13 26 L18.5 33.5" opacity="0.5" />
        <path d="M35 26 L29.5 33.5" opacity="0.5" />
      </g>
    </svg>
  );
}
