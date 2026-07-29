"use client";

import type { EvidenceMoment } from "@/lib/intelligence/recommendations";

/** Custom event the overlay player listens for to jump to an evidence timestamp. */
export const EVIDENCE_SEEK_EVENT = "ava:evidence-seek";

export function dispatchEvidenceSeek(timeS: number, label: string) {
  window.dispatchEvent(new CustomEvent(EVIDENCE_SEEK_EVENT, { detail: { timeS, label } }));
}

/**
 * Renders a recommendation's evidence moments as clickable "View evidence" chips.
 * Clicking a chip jumps the overlay video to that timestamp (via a window event the
 * player listens for) — no direct coupling between this card and the player.
 *
 * When there are no moments it shows an honest "unavailable" line instead of a broken
 * button. Presentation only.
 */
export default function EvidenceMoments({ moments }: { moments: EvidenceMoment[] }) {
  if (moments.length === 0) {
    return (
      <p className="mt-3 text-xs italic text-[#7e8797]">
        Evidence frames unavailable for this recording.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7e8797]">
          View evidence
        </span>
        {moments.map((m) => (
          <button
            key={`${m.label}-${m.timeS}`}
            type="button"
            onClick={() => dispatchEvidenceSeek(m.timeS, m.label)}
            title={m.reason}
            className="inline-flex items-center gap-1 rounded-full border border-[#2f80ed]/40 bg-[#2f80ed]/10 px-2.5 py-1 text-[11px] font-semibold text-[#3b8eff] transition hover:bg-[#2f80ed]/20"
          >
            <span aria-hidden="true">▶</span>
            {m.label}
            <span className="text-[#b3bccb]">· {m.timeS.toFixed(2)}s</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs leading-5 text-[#7e8797]">
        AVA selected this because {lowerFirst(moments[0].reason)}
      </p>
    </div>
  );
}

/** Lower-case the first letter so it reads inside the "AVA selected this because …" sentence. */
function lowerFirst(s: string): string {
  return s.length ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
