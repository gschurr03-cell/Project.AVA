import type { ReactNode } from "react";

type AvaCautionPanelProps = {
  /** Big header line, e.g. "Coming Soon". */
  title?: string;
  /** Secondary header line, e.g. "Experimental Metrics". */
  subtitle?: string;
  /** Short system-confidence explanation shown under the header. */
  description?: ReactNode;
  /** The gold pill label at top-right. */
  pill?: string;
  /** Stamp a faint "COMING SOON" watermark over the children. */
  watermark?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
};

/**
 * A dark, collapsible "Coming Soon / Caution" section for outputs AVA cannot yet
 * track accurately enough to present as trusted metrics. Caution-tape (gold/black
 * hazard stripes) top + bottom, a gold caution pill, and — when expanded — the child
 * content rendered dimmed behind a faint "COMING SOON" watermark so it's obvious
 * these are experimental, not production-trusted numbers.
 *
 * Presentation only: it never alters the calculations passed in as children.
 */
export function AvaCautionPanel({
  title = "Coming Soon",
  subtitle = "Experimental Metrics",
  description,
  pill = "Not yet reliable",
  watermark = true,
  defaultOpen = false,
  children,
  className = "",
}: AvaCautionPanelProps) {
  return (
    <details
      open={defaultOpen}
      className={`group overflow-hidden rounded-2xl border border-dashed border-[#D4AF37]/35 bg-[#121214]/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)] ${className}`}
    >
      {/* Caution tape — top */}
      <div className="h-2 w-full ava-caution-tape opacity-70" aria-hidden="true" />

      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-lg text-[#D4AF37]" aria-hidden="true">
            ⚠
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#D4AF37]">
              {title}
            </p>
            <h3 className="mt-0.5 text-lg font-semibold tracking-tight text-[#F5F5F7]">{subtitle}</h3>
            {description && (
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#A0A2A8]">{description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[#D4AF37]/45 bg-[#D4AF37]/12 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#E4C25A]">
            {pill}
          </span>
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-[#6B7280] transition-transform duration-150 group-open:rotate-90"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </summary>

      {/* Blocked/flagged content: dimmed + watermarked so it never reads as trusted. */}
      <div className="px-5 pb-5">
        <div className={`${watermark ? "ava-coming-soon" : ""} rounded-xl border border-white/[0.06] bg-black/30 p-4`}>
          {/* Dimmed so it reads as flagged/experimental, but still legible + selectable
              for internal testing (no pointer-events block). */}
          <div className="opacity-50">{children}</div>
        </div>
      </div>

      {/* Caution tape — bottom */}
      <div className="h-2 w-full ava-caution-tape opacity-70" aria-hidden="true" />
    </details>
  );
}
