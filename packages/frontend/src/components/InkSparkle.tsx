// Sparkles icon (lucide path data) with a gradient stroke matching the
// Ink avatar ring's three hues. The `ink-icon` class hue-rotates the whole
// SVG so the gradient cycles through the spectrum like the export PNG
// does, statically.
export function InkSparkle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="ink-sparkle-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(45 100% 60%)" />
          <stop offset="50%" stopColor="hsl(320 80% 60%)" />
          <stop offset="100%" stopColor="hsl(200 80% 55%)" />
        </linearGradient>
      </defs>
      <g stroke="url(#ink-sparkle-stroke)">
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        <path d="M20 3v4" />
        <path d="M22 5h-4" />
        <path d="M4 17v2" />
        <path d="M5 18H3" />
      </g>
    </svg>
  );
}
