"use client";

import { useState } from "react";
import { AvaStatusPill } from "@/components/ava/AvaStatusPill";
import { resetCalibrationToAuto } from "@/app/sessions/actions";
import type { CalibrationSource } from "@/lib/calibration/gates";
import type { CalibrationResultStatus } from "@/lib/calibration/lifecycle";

/**
 * Restrained calibration-authority status + the explicit Reset-to-Auto control
 * (Part 1). Shows whether the zone is auto/manually-adjusted/confirmed and whether
 * dependent metrics are recomputing, and gates the destructive reset behind an
 * inline confirmation — no large new card.
 */
const SOURCE_LABEL: Record<CalibrationSource, string> = {
  auto: "Auto detected",
  manual_draft: "Manual adjustment",
  manual_confirmed: "Manual zone confirmed",
};
const SOURCE_TONE: Record<CalibrationSource, "gold" | "silver" | "gray"> = {
  auto: "gray",
  manual_draft: "silver",
  manual_confirmed: "gold",
};

export default function CalibrationAuthorityControls({
  sessionId,
  source,
  resultStatus,
  revision,
}: {
  sessionId: string;
  source: CalibrationSource | null;
  resultStatus: CalibrationResultStatus;
  revision: number;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!source) return null;
  const isManualConfirmed = source === "manual_confirmed";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-[#101827] px-3 py-2">
      <AvaStatusPill label={SOURCE_LABEL[source]} tone={SOURCE_TONE[source]} />
      {resultStatus === "pending" && <AvaStatusPill label="Recalculation pending" tone="silver" />}
      {resultStatus === "superseded" && <AvaStatusPill label="Metrics superseded" tone="silver" />}
      <span className="ml-auto text-[11px] text-[#7e8797]" title="Calibration revision (diagnostics)">
        rev {revision}
      </span>

      {isManualConfirmed &&
        (confirming ? (
          <form action={resetCalibrationToAuto} className="flex items-center gap-2">
            <input type="hidden" name="id" value={sessionId} />
            <span className="text-[11px] text-[#f5c451]">Replace the confirmed manual zone?</span>
            <button
              type="submit"
              className="rounded-lg border border-[#2f80ed]/50 px-2.5 py-1 text-[11px] font-semibold text-[#e46464]"
            >
              Confirm reset
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-[#b3bccb]"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-[#b3bccb] transition hover:text-[#f5f7fb]"
          >
            Reset to auto
          </button>
        ))}
    </div>
  );
}
