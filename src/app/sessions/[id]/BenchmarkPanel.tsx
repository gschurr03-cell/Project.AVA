import type { ReactNode } from "react";
import { setSessionBenchmark } from "@/app/sessions/actions";
import { AvaPanel } from "@/components/ava/AvaPanel";
import { AVA_BADGE } from "@/lib/design/ava";
import type { SprintMeasurements } from "@/lib/benchmark/measurements";
import type { AccuracyRow, BenchmarkComparisonRow, ComparisonStatus } from "@/lib/benchmark";
import {
  classifyMetric,
  isPrecisionLimited,
  HIGH_PRECISION_TIMING_FPS,
} from "@/lib/benchmark/precision";

/**
 * Presentation only: AVA's full calibrated sprint measurement set, the active
 * FPS source, a benchmark link selector, and — when the session is linked to a
 * benchmark — the ground-truth validation table (AVA vs reference vs % error).
 * All numbers come from the pure engines; no logic here beyond formatting.
 *
 * Dark AVA theme. Comparison status maps onto the medal system (ok = Gold,
 * warn = Bronze, off = Red Alert, missing = Gray, info = Silver). Precision-limited
 * timing rows are moved into a "Coming Soon / Caution" section, not shown as trusted.
 */

const n2 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2));
const n1 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));
const int = (v: number | null | undefined) => (v == null ? "—" : String(v));

const BADGE_BASE = "rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide";

/** Per-side frequency is computed + stored but hidden from the UI (Day 74) — only
 *  the combined value is shown. Filtered from the comparison table below. */
const HIDDEN_COMPARISON_KEYS: ReadonlySet<string> = new Set([
  "leftStepFrequencyHz",
  "rightStepFrequencyHz",
]);

const STATUS_BADGE: Record<ComparisonStatus, string> = {
  ok: AVA_BADGE.gold,
  warn: AVA_BADGE.bronze,
  off: AVA_BADGE.alert,
  missing: AVA_BADGE.gray,
  info: AVA_BADGE.silver,
};

const STATUS_LABEL: Record<ComparisonStatus, string> = {
  ok: "≤10%",
  warn: "≤25%",
  off: ">25%",
  missing: "no AVA value",
  info: "AVA only",
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#f5f7fb]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[#7e8797]">{sub}</p>}
    </div>
  );
}

/**
 * A compact, default-collapsed disclosure card (Day 73 declutter). Keeps diagnostic
 * detail available behind a chevron so the headline numbers read first. Presentation
 * only — no data is removed, just hidden until expanded.
 */
function Collapsible({
  title,
  hint,
  children,
  defaultOpen = false,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group mb-4 rounded-xl border border-white/[0.06] bg-[#182233] text-sm"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#b3bccb]">
          {title}
          {hint && <span className="ml-2 font-normal normal-case text-[#7e8797]">{hint}</span>}
        </span>
        <svg
          className="h-3.5 w-3.5 shrink-0 text-[#7e8797] transition-transform duration-150 group-open:rotate-90"
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
      </summary>
      <div className="border-t border-white/[0.06] px-3 py-3">{children}</div>
    </details>
  );
}

/** AVA-vs-benchmark rows as a table. `muted` dims a lower-confidence group. */
function ComparisonTable({ rows, muted }: { rows: BenchmarkComparisonRow[]; muted?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-left text-xs uppercase tracking-wide text-[#7e8797]">
            <th className="px-2 py-1">Metric</th>
            <th className="px-2 py-1 text-right">AVA</th>
            <th className="px-2 py-1 text-right">Benchmark</th>
            <th className="px-2 py-1 text-right">% error</th>
            <th className="px-2 py-1 text-right">Status</th>
          </tr>
        </thead>
        <tbody className={muted ? "opacity-70" : undefined}>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-white/[0.06] last:border-0">
              <td className="px-2 py-1.5 text-[#b3bccb]">
                {r.label}
                {r.unit && <span className="ml-1 text-xs text-[#7e8797]">({r.unit})</span>}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-[#f5f7fb]">
                {r.avaValue != null ? r.avaValue.toFixed(2) : "—"}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-[#f5f7fb]">
                {r.benchmarkValue != null ? r.benchmarkValue.toFixed(2) : "—"}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-[#f5f7fb]">
                {r.percentError != null ? `${r.percentError.toFixed(1)}%` : "—"}
              </td>
              <td className="px-2 py-1.5 text-right">
                <span className={`${BADGE_BASE} ${STATUS_BADGE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BenchmarkPanel({
  sessionId,
  measurements,
  activeFps,
  fpsSource,
  detectedFps,
  fpsOverride,
  benchmarks,
  linkedBenchmarkId,
  comparison,
}: {
  sessionId: string;
  measurements: SprintMeasurements;
  activeFps: number | null;
  fpsSource: "override" | "normalized" | "detected" | "none";
  detectedFps: number | null;
  fpsOverride: number | null;
  benchmarks: { id: string; name: string }[];
  linkedBenchmarkId: string | null;
  comparison: { benchmarkName: string; rows: BenchmarkComparisonRow[]; accuracy: AccuracyRow[] } | null;
}) {
  const m = measurements;
  const primaryVel = m.velocities.find((v) => v.key === "distanceTime")?.value ?? m.zoneVelocityMps;
  const precisionLimited = isPrecisionLimited(activeFps);

  return (
    <AvaPanel eyebrow="Validation" title="Sprint Measurements & Benchmark">
      <p className="-mt-3 mb-4 text-xs text-[#7e8797]">
        Calibrated measurements from verified ground contacts and the manual zone. Step length,
        stride length, step frequency, average velocity, and peak velocity are the reported metrics.
      </p>

      {/* FPS / precision / camera compensation — diagnostic, collapsed by default. */}
      <Collapsible
        title="FPS, precision & camera"
        hint={`${activeFps ?? "—"} fps${precisionLimited ? " · precision mode" : ""} · ${m.cameraCompensation.confidence} camera`}
      >
        {precisionLimited && (
          <div className="mb-3 rounded-lg border border-[#f5c451]/40 bg-[#f5c451]/10 p-3 text-xs text-[#f5c451]">
            <p className="font-semibold text-[#f5c451]">
              Precision mode — {activeFps ?? "unknown"} fps (high-precision timing needs ≥
              {HIGH_PRECISION_TIMING_FPS} fps)
            </p>
            <p className="mt-1">
              Headline metrics are the trusted spatial/zone measurements (step length, stride length,
              zone distance, velocity, step frequency). Small left/right asymmetries are shown as
              diagnostics only. Capture at 120–240 fps for higher-precision measurement.
            </p>
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-[#7e8797]">Active FPS</span>
          <span className="text-lg font-bold text-[#f5f7fb]">{activeFps ?? "—"}</span>
          <span
            className={`${BADGE_BASE} ${
              fpsSource === "override"
                ? AVA_BADGE.bronze
                : fpsSource === "normalized"
                  ? AVA_BADGE.silver
                  : AVA_BADGE.gold
            }`}
          >
            {fpsSource === "override"
              ? "manual override"
              : fpsSource === "normalized"
                ? "normalized"
                : fpsSource === "detected"
                  ? "detected"
                  : "unknown"}
          </span>
          <span className="text-xs text-[#7e8797]">
            detected {detectedFps ?? "—"}
            {fpsSource === "normalized" ? ` → ${activeFps} (snapped to canonical)` : ""} · override{" "}
            {fpsOverride ?? "—"} · drives all timing (frequency, zone, velocity)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-[#7e8797]">
            Camera compensation
          </span>
          <span
            className={`${BADGE_BASE} ${
              m.cameraCompensation.confidence === "high"
                ? AVA_BADGE.gold
                : m.cameraCompensation.confidence === "medium"
                  ? AVA_BADGE.silver
                  : m.cameraCompensation.confidence === "low"
                    ? AVA_BADGE.bronze
                    : AVA_BADGE.gray
            }`}
          >
            {m.cameraCompensation.confidence}
          </span>
          <span className="text-xs text-[#7e8797]">
            {m.cameraCompensation.available
              ? `Spatial metrics use stabilized world coordinates · ${Math.round(m.cameraCompensation.coverage * 100)}% frame coverage`
              : "Not compensated — spatial metrics use raw frame coordinates"}
          </span>
        </div>
        {m.cameraCompensation.warning && (
          <p className="mt-3 rounded-lg border border-[#f5c451]/40 bg-[#f5c451]/10 px-3 py-2 text-xs text-[#f5c451]">
            ⚠ {m.cameraCompensation.warning}
          </p>
        )}
      </Collapsible>

      {!m.calibrated && (
        <p className="mb-4 rounded-lg border border-[#f5c451]/40 bg-[#f5c451]/10 px-3 py-2 text-xs text-[#f5c451]">
          No manual calibration yet — contact counts and cadence are shown, but step length and
          velocity need two calibration gates a known distance apart (Calibration gates on the overlay).
        </p>
      )}

      {/* Contacts & frequency — detailed cards, collapsed by default. Only the
          COMBINED frequency is surfaced (Day 74); per-side frequency stays computed
          + stored, just not shown. */}
      <Collapsible
        title="Contacts & frequency"
        hint={`${m.combinedStepFrequencyHz != null ? n2(m.combinedStepFrequencyHz) : "—"} steps/s · ${int(m.validContacts)} in-zone contacts`}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat
            label="Frequency"
            value={m.combinedStepFrequencyHz != null ? `${n2(m.combinedStepFrequencyHz)}` : "—"}
            sub="steps/s"
          />
          <Stat
            label="Contacts (total)"
            value={int(m.totalContacts)}
            sub={`L ${m.leftContacts} · R ${m.rightContacts}`}
          />
          <Stat
            label="Valid in zone"
            value={int(m.validContacts)}
            sub={
              m.zoneStepSummary
                ? "contacts landing between Start and Finish"
                : m.zoneTimeS != null
                  ? `over ${n2(m.zoneTimeS)} s`
                  : "no zone time"
            }
          />
        </div>
      </Collapsible>

      {/* Step length — detailed cards, collapsed by default (Day 74). The headline
          average also appears in the benchmark comparison table below. */}
      <Collapsible
        title="Step length"
        hint={`avg ${
          m.avgIndividualStepLengthM != null
            ? n2(m.avgIndividualStepLengthM)
            : m.avgZoneStepLengthM != null
              ? n2(m.avgZoneStepLengthM)
              : "—"
        } m · ${m.stepLengthConfidence} confidence`}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label={m.zoneStepSummary ? "Avg (valid intervals)" : "Avg (zone ÷ steps)"}
            value={m.avgZoneStepLengthM != null ? `${n2(m.avgZoneStepLengthM)} m` : "—"}
            sub="trusted"
          />
          <Stat label="Avg (individual)" value={m.avgIndividualStepLengthM != null ? `${n2(m.avgIndividualStepLengthM)} m` : "—"} />
          <Stat label="Left step" value={m.leftStepLengthM != null ? `${n2(m.leftStepLengthM)} m` : "—"} />
          <Stat label="Right step" value={m.rightStepLengthM != null ? `${n2(m.rightStepLengthM)} m` : "—"} />
        </div>
        {m.calibrated && m.zoneSteps.some((s) => s.stepLengthM != null) && (
          <p className="mt-3 text-xs text-[#7e8797]">
            <span className="font-medium text-[#b3bccb]">Individual steps through the zone:</span>{" "}
            {m.zoneSteps
              .filter((s) => s.stepLengthM != null)
              .map(
                (s) =>
                  `#${s.index} ${s.fromSide ? `${s.fromSide[0].toUpperCase()}→${s.side[0].toUpperCase()} ` : ""}${(s.stepLengthM ?? 0).toFixed(2)}m`,
              )
              .join(" · ")}
            {m.stepLengthConfidence !== "high" && (
              <span className="ml-1 text-[#f5c451]">
                (lower confidence — trust the zone average above)
              </span>
            )}
          </p>
        )}
        {m.zoneStepSummary && (
          <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-[#b3bccb]">
            <p>
              <span className="font-medium text-[#f5f7fb]">
                {m.zoneStepSummary.stepLengthCount} measured intervals
              </span>
              {" "}from the first in-zone contact
              {m.zoneStepSummary.stepWindow.trailingExitIntervalIncluded
                ? ", including the final contact-to-exit interval."
                : m.zoneStepSummary.firstPostZoneContactId
                  ? "; the first post-zone endpoint was observed, but its interval was withheld by validation."
                : "; the final interval is unavailable because no post-zone contact was observed."}
            </p>
            {m.zoneStepSummary.qualityFlags.length > 0 && (
              <p className="mt-1 text-[#f5c451]">
                Review: {m.zoneStepSummary.qualityFlags.map((flag) => flag.replaceAll("_", " ")).join(" · ")}
              </p>
            )}
            <p className="mt-1 text-[#7e8797]">
              Longitudinal sprint-axis metres · lateral movement reported separately · {m.zoneStepSummary.measurementVersion}
            </p>
          </div>
        )}
        {m.zoneStepSummary && (
          <details className="mt-4 rounded-lg border border-white/[0.06] bg-black/10 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-[#D7D7DB]">
              Authoritative measurement window
            </summary>
            <p className="mt-3 text-xs text-[#b3bccb]">
              AVA counts contacts whose landing locations occur inside the calibrated zone.
              Step-length measurement begins at the first in-zone landing and ends at the
              first landing after the finish boundary.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Stat label="Contacts counted" value={String(m.zoneStepSummary.stepWindow.inZoneContactCount)} sub="in zone" />
              <Stat label="Intervals measured" value={String(m.zoneStepSummary.stepWindow.measuredIntervalCount)} />
              <Stat label="Confidence" value={`${Math.round(m.zoneStepSummary.confidence.score * 100)}%`} sub={m.zoneStepSummary.confidence.label} />
              <Stat label="Semantics" value={m.zoneStepSummary.schemaVersion} />
            </div>
            <p className="mt-3 text-[11px] text-[#7e8797]">
              <span className="text-[#64D28B]">● In-zone contact</span>{" · "}
              <span className="text-[#5AA9FF]">◆ Final post-zone endpoint</span>{" · "}
              <span>○ Excluded contact</span>{" · "}
              <span className="text-[#f5c451]">△ Ambiguous contact</span>
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[#7e8797]"><tr><th className="py-1 pr-3">Interval</th><th className="pr-3">Contacts</th><th className="pr-3">Landing</th><th className="pr-3">Length</th><th>Lateral</th></tr></thead>
                <tbody>
                  {m.zoneStepSummary.intervals.map((interval) => (
                    <tr key={interval.id} className="border-t border-white/[0.05]">
                      <td className="py-1 pr-3">{interval.kind === "trailing_exit" ? "Final exit" : `#${interval.index}`}</td>
                      <td className="pr-3 font-mono text-[10px]">{interval.fromContactId} → {interval.toContactId}</td>
                      <td className="pr-3">{interval.toSide}</td>
                      <td className="pr-3">
                        {interval.longitudinalLengthM == null
                          ? `withheld (${n2(interval.rawLongitudinalDisplacementM)} m)`
                          : `${n2(interval.longitudinalLengthM)} m`}
                      </td>
                      <td>{n2(interval.lateralDisplacementM)} m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </Collapsible>

      {/* Velocity cross-check — diagnostic table, collapsed by default. */}
      <Collapsible
        title="Velocity (cross-checked)"
        hint={`zone ${primaryVel != null ? n2(primaryVel) : "—"} m/s · max ${m.maxVelocityMps != null ? n2(m.maxVelocityMps) : "—"} m/s`}
      >
        <div className="overflow-hidden rounded-lg border border-white/[0.06]">
          <table className="w-full text-sm">
            <tbody>
              {m.velocities.map((v) => (
                <tr key={v.key} className="border-b border-white/[0.06] last:border-0">
                  <td className="px-3 py-2 text-[#b3bccb]">{v.label}</td>
                  <td className="px-3 py-2 text-right font-mono text-[#f5f7fb]">
                    {v.value != null ? `${n2(v.value)} m/s` : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-[#7e8797]">{v.method}</td>
                </tr>
              ))}
              <tr className="border-b border-white/[0.06] last:border-0 bg-white/[0.03]">
                <td className="px-3 py-2 font-medium text-[#b3bccb]">Max velocity (peak single-stride)</td>
                <td className="px-3 py-2 text-right font-mono text-[#f5f7fb]">
                  {m.maxVelocityMps != null ? `${n2(m.maxVelocityMps)} m/s` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-[#7e8797]">fastest stride</td>
              </tr>
            </tbody>
          </table>
        </div>
        {m.velocitySpreadPct != null && (
          <p className={`mt-2 text-xs ${m.velocitySpreadPct > 15 ? "text-[#f5c451]" : "text-[#7e8797]"}`}>
            Methods spread {n1(m.velocitySpreadPct)}% · {m.velocityNote}
            {primaryVel != null && ` · zone velocity ${n2(primaryVel)} m/s`}
          </p>
        )}
      </Collapsible>

      {/* Benchmark link + validation */}
      <div className="mt-5 rounded-xl border border-white/[0.06] bg-[#182233] p-4">
        <h3 className="mb-2 text-sm font-semibold text-[#f5f7fb]">Benchmark validation</h3>
        <form action={setSessionBenchmark} className="mb-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={sessionId} />
          <label htmlFor="benchmark_id" className="text-xs text-[#7e8797]">
            Compare against
          </label>
          <select
            id="benchmark_id"
            name="benchmark_id"
            defaultValue={linkedBenchmarkId ?? ""}
            className="rounded-lg border border-white/[0.08] bg-[#081019] px-2 py-1 text-sm text-[#f5f7fb] focus:border-[#2f80ed]/50 focus:outline-none"
          >
            <option value="">Not linked</option>
            {benchmarks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-3 py-1 text-sm font-medium text-[#f5f7fb] transition hover:bg-white/[0.09]"
          >
            Save link
          </button>
        </form>

        {comparison ? (
          <>
            {/* Accuracy targets (Day 65): headline metrics vs their error budgets. */}
            <div className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#7e8797]">
                Accuracy vs targets
              </p>
              <div className="space-y-1">
                {comparison.accuracy.map((a) => (
                  <div key={a.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-[#b3bccb]">{a.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[#7e8797]">
                        {a.errorPct != null ? `${a.errorPct.toFixed(1)}%` : "—"} / ≤{a.targetPct}%
                      </span>
                      <span
                        className={`${BADGE_BASE} ${
                          a.status === "pass"
                            ? AVA_BADGE.gold
                            : a.status === "fail"
                              ? AVA_BADGE.alert
                              : AVA_BADGE.gray
                        }`}
                      >
                        {a.status === "pass" ? "✓ meets" : a.status === "fail" ? "over target" : "n/a"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-[#7e8797]">
                Frequency is temporal (high confidence). Spatial metrics depend on calibration + camera
                compensation; when over target the diagnostics above explain why (partial early tracking,
                camera-pan estimation). Average step length uses the trusted zone method (distance ÷ steps).
              </p>
            </div>

            {(() => {
              // Tier the comparison rows by how much the active FPS limits each
              // metric: trusted spatial/zone (primary), per-side asymmetry
              // (diagnostic), and frame-quantized timing (requires higher FPS).
              const primary: BenchmarkComparisonRow[] = [];
              const diagnostic: BenchmarkComparisonRow[] = [];
              for (const r of comparison.rows) {
                if (HIDDEN_COMPARISON_KEYS.has(r.key)) continue; // per-side freq hidden (Day 74)
                const tier = classifyMetric(r.key, activeFps);
                // MVP scope: frame-quantized timing metrics (contact / flight time) are
                // not part of the five MVP metrics — exclude them from the comparison.
                if (tier === "requiresHigherFps") continue;
                if (tier === "diagnostic") diagnostic.push(r);
                else primary.push(r);
              }
              return (
                <>
                  <p className="mb-2 text-xs text-[#7e8797]">
                    AVA vs <span className="font-medium text-[#b3bccb]">{comparison.benchmarkName}</span> —
                    percent error per metric. Gold ≤10%, bronze ≤25%, red alert &gt;25%.
                  </p>
                  {primary.length > 0 && <ComparisonTable rows={primary} />}

                  {diagnostic.length > 0 && (
                    <details className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                      <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-[#7e8797]">
                        Per-side detail (diagnostic) — left/right asymmetry
                      </summary>
                      <div className="mt-2">
                        <ComparisonTable rows={diagnostic} muted />
                      </div>
                      <p className="mt-2 text-xs text-[#7e8797]">
                        Small left/right differences are diagnostic detail, not headline numbers —
                        the per-side spread is near the detection/frame-rate noise floor.
                      </p>
                    </details>
                  )}

                  {/* MVP: the "Coming Soon · Timing (contact/flight)" comparison block is
                      outside the locked five-metric scope and is not rendered. */}
                </>
              );
            })()}
          </>
        ) : (
          <p className="text-xs text-[#7e8797]">
            Link this session to a benchmark to validate every calculated metric against the
            reference and report percent error. Comparisons only appear for an explicitly linked
            session.
          </p>
        )}
      </div>
    </AvaPanel>
  );
}
