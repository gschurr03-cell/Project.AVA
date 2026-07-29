import Link from "next/link";
import { AvaPanel } from "@/components/ava/AvaPanel";

/**
 * Read-only calibration status for the Analysis page. The Analysis page NEVER edits
 * calibration — this card summarizes the single authoritative calibration and links to
 * the Timing Workspace (the sole calibration editor). Four user-facing states only:
 * Not Started · In Progress · Confirmed · Needs Review (no detector/technical wording).
 */
export type CalibrationCardStatus = "Not Started" | "In Progress" | "Confirmed" | "Needs Review";

const ZONE_LABEL: Record<string, string> = {
  acceleration: "Acceleration",
  timed_zone: "Timed Zone",
  split_timing: "Split Timing",
};

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7e8797]">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-[#f5f7fb]">{value}</p>
    </div>
  );
}

export default function CalibrationStatusCard({
  sessionId,
  status,
  distanceM,
  zoneType,
  bodyReference = "Torso",
  revision,
  updatedAt,
}: {
  sessionId: string;
  status: CalibrationCardStatus;
  distanceM: number | null;
  zoneType: string | null;
  bodyReference?: string;
  revision: number | null;
  updatedAt: string | null;
}) {
  const confirmed = status === "Confirmed";
  const tone = confirmed ? "#89d46a" : status === "Not Started" ? "#7e8797" : "#f5c451";
  const icon = confirmed ? "✓" : status === "Not Started" ? "○" : "⚠";
  const zoneLabel = zoneType ? ZONE_LABEL[zoneType] ?? "Timed Zone" : "Timed Zone";
  const zoneSummary = distanceM != null ? `${Math.round(distanceM)} m ${zoneLabel}` : zoneLabel;
  const updated = relativeTime(updatedAt);

  return (
    <AvaPanel eyebrow="Calibration" title="Calibration status">
      <div className="-mt-2 mb-3 flex items-center gap-2">
        <span className="text-lg font-bold" style={{ color: tone }}>{icon}</span>
        <span className="text-lg font-semibold" style={{ color: tone }}>{status}</span>
      </div>
      {confirmed ? (
        <>
          <p className="mb-4 text-sm text-[#b3bccb]">{zoneSummary}</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Zone" value={zoneSummary} />
            <Field label="Body Reference" value={bodyReference} />
            <Field label="Revision" value={revision != null ? String(revision) : "—"} />
            <Field label="Last Updated" value={updated ?? "—"} />
          </div>
        </>
      ) : (
        <p className="mb-4 text-sm text-[#b3bccb]">
          {status === "Not Started"
            ? "Timing metrics are unavailable until a zone is confirmed."
            : status === "Needs Review"
              ? "This calibration was superseded. Reopen the Timing Workspace to review and re-confirm the zone."
              : "Zone setup is in progress. Finish placing and confirming the gates in the Timing Workspace."}
        </p>
      )}
      <Link
        href={`/sessions/${sessionId}/timing`}
        className="mt-2 inline-flex items-center rounded-lg bg-[#2f80ed] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#3b8eff]"
      >
        Open Timing Workspace
      </Link>
    </AvaPanel>
  );
}
