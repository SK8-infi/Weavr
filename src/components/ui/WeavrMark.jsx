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
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="55%" stopColor="var(--color-brand-500)" />
          <stop offset="100%" stopColor="#4c1fd6" />
        </linearGradient>
        <linearGradient id="weavr-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.3" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="48" height="48" rx="13" fill="url(#weavr-tile)" />
      {/* A sheen down the top half keeps the tile from reading as flat fill. */}
      <rect width="48" height="30" rx="13" fill="url(#weavr-sheen)" />

      <g stroke="white" strokeWidth="2.9" strokeLinecap="round" fill="none">
        <path d="M13 16 L24 32 L35 16" />
        <path d="M13 26 L18.5 33.5" opacity="0.55" />
        <path d="M35 26 L29.5 33.5" opacity="0.55" />
      </g>
    </svg>
  );
}
