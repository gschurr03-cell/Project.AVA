import type { ReactNode } from "react";
import { setSessionBenchmark } from "@/app/sessions/actions";
import { AvaPanel } from "@/components/ava/AvaPanel";
import { AvaCautionPanel } from "@/components/ava/AvaCautionPanel";
import { AVA_BADGE } from "@/lib/design/ava";
import type { SprintMeasurements } from "@/lib/benchmark/measurements";
import type { AccuracyRow, BenchmarkComparisonRow, ComparisonStatus } from "@/lib/benchmark";
import {
  classifyMetric,
  isPrecisionLimited,
  PRECISION_TIMING_MESSAGE,
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
    <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#F5F5F7]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[#6B7280]">{sub}</p>}
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
      className="group mb-4 rounded-xl border border-white/[0.06] bg-[#19191C] text-sm"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#A0A2A8]">
          {title}
          {hint && <span className="ml-2 font-normal normal-case text-[#6B7280]">{hint}</span>}
        </span>
        <svg
          className="h-3.5 w-3.5 shrink-0 text-[#6B7280] transition-transform duration-150 group-open:rotate-90"
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
          <tr className="border-b border-white/[0.08] text-left text-xs uppercase tracking-wide text-[#6B7280]">
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
              <td className="px-2 py-1.5 text-[#A0A2A8]">
                {r.label}
                {r.unit && <span className="ml-1 text-xs text-[#6B7280]">({r.unit})</span>}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-[#F5F5F7]">
                {r.avaValue != null ? r.avaValue.toFixed(2) : "—"}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-[#F5F5F7]">
                {r.benchmarkValue != null ? r.benchmarkValue.toFixed(2) : "—"}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-[#F5F5F7]">
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
      <p className="-mt-3 mb-4 text-xs text-[#6B7280]">
        Calibrated measurements from verified ground contacts and the manual zone. Step frequency,
        step length, contact time, and flight time are separate metrics and reported as such.
      </p>

      {/* FPS / precision / camera compensation — diagnostic, collapsed by default. */}
      <Collapsible
        title="FPS, precision & camera"
        hint={`${activeFps ?? "—"} fps${precisionLimited ? " · precision mode" : ""} · ${m.cameraCompensation.confidence} camera`}
      >
        {precisionLimited && (
          <div className="mb-3 rounded-lg border border-[#CD7F32]/40 bg-[#CD7F32]/10 p-3 text-xs text-[#E0A063]">
            <p className="font-semibold text-[#E4C25A]">
              Precision mode — {activeFps ?? "unknown"} fps (high-precision timing needs ≥
              {HIGH_PRECISION_TIMING_FPS} fps)
            </p>
            <p className="mt-1">
              Headline metrics are the trusted spatial/zone measurements (step length, zone distance,
              velocity, combined cadence). Ground contact, flight time, and small left/right
              asymmetries are shown as diagnostics only — one frame (~
              {Math.round(1000 / (activeFps || 60))} ms) is too large a share of an ~80 ms contact to
              trust as a headline number. Capture at 120–240 fps for high-precision timing.
            </p>
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Active FPS</span>
          <span className="text-lg font-bold text-[#F5F5F7]">{activeFps ?? "—"}</span>
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
          <span className="text-xs text-[#6B7280]">
            detected {detectedFps ?? "—"}
            {fpsSource === "normalized" ? ` → ${activeFps} (snapped to canonical)` : ""} · override{" "}
            {fpsOverride ?? "—"} · drives all timing (contact, flight, frequency, zone, velocity, phases)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">
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
          <span className="text-xs text-[#6B7280]">
            {m.cameraCompensation.available
              ? `Spatial metrics use stabilized world coordinates · ${Math.round(m.cameraCompensation.coverage * 100)}% frame coverage`
              : "Not compensated — spatial metrics use raw frame coordinates"}
          </span>
        </div>
        {m.cameraCompensation.warning && (
          <p className="mt-3 rounded-lg border border-[#CD7F32]/40 bg-[#CD7F32]/10 px-3 py-2 text-xs text-[#E0A063]">
            ⚠ {m.cameraCompensation.warning}
          </p>
        )}
      </Collapsible>

      {!m.calibrated && (
        <p className="mb-4 rounded-lg border border-[#CD7F32]/40 bg-[#CD7F32]/10 px-3 py-2 text-xs text-[#E0A063]">
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
            sub={m.zoneTimeS != null ? `over ${n2(m.zoneTimeS)} s` : "no zone time"}
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
          <Stat label="Avg (zone ÷ steps)" value={m.avgZoneStepLengthM != null ? `${n2(m.avgZoneStepLengthM)} m` : "—"} sub="trusted" />
          <Stat label="Avg (individual)" value={m.avgIndividualStepLengthM != null ? `${n2(m.avgIndividualStepLengthM)} m` : "—"} />
          <Stat label="Left step" value={m.leftStepLengthM != null ? `${n2(m.leftStepLengthM)} m` : "—"} />
          <Stat label="Right step" value={m.rightStepLengthM != null ? `${n2(m.rightStepLengthM)} m` : "—"} />
        </div>
        {m.calibrated && m.zoneSteps.some((s) => s.stepLengthM != null) && (
          <p className="mt-3 text-xs text-[#6B7280]">
            <span className="font-medium text-[#A0A2A8]">Individual steps through the zone:</span>{" "}
            {m.zoneSteps
              .filter((s) => s.stepLengthM != null)
              .map(
                (s) =>
                  `#${s.index} ${s.fromSide ? `${s.fromSide[0].toUpperCase()}→${s.side[0].toUpperCase()} ` : ""}${(s.stepLengthM ?? 0).toFixed(2)}m`,
              )
              .join(" · ")}
            {m.stepLengthConfidence !== "high" && (
              <span className="ml-1 text-[#E0A063]">
                (lower confidence — trust the zone average above)
              </span>
            )}
          </p>
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
                  <td className="px-3 py-2 text-[#A0A2A8]">{v.label}</td>
                  <td className="px-3 py-2 text-right font-mono text-[#F5F5F7]">
                    {v.value != null ? `${n2(v.value)} m/s` : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-[#6B7280]">{v.method}</td>
                </tr>
              ))}
              <tr className="border-b border-white/[0.06] last:border-0 bg-white/[0.03]">
                <td className="px-3 py-2 font-medium text-[#A0A2A8]">Max velocity (peak single-stride)</td>
                <td className="px-3 py-2 text-right font-mono text-[#F5F5F7]">
                  {m.maxVelocityMps != null ? `${n2(m.maxVelocityMps)} m/s` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-[#6B7280]">fastest stride</td>
              </tr>
            </tbody>
          </table>
        </div>
        {m.velocitySpreadPct != null && (
          <p className={`mt-2 text-xs ${m.velocitySpreadPct > 15 ? "text-[#E0A063]" : "text-[#6B7280]"}`}>
            Methods spread {n1(m.velocitySpreadPct)}% · {m.velocityNote}
            {primaryVel != null && ` · zone velocity ${n2(primaryVel)} m/s`}
          </p>
        )}
      </Collapsible>

      {/* Benchmark link + validation */}
      <div className="mt-5 rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
        <h3 className="mb-2 text-sm font-semibold text-[#F5F5F7]">Benchmark validation</h3>
        <form action={setSessionBenchmark} className="mb-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={sessionId} />
          <label htmlFor="benchmark_id" className="text-xs text-[#6B7280]">
            Compare against
          </label>
          <select
            id="benchmark_id"
            name="benchmark_id"
            defaultValue={linkedBenchmarkId ?? ""}
            className="rounded-lg border border-white/[0.08] bg-[#0d0d0f] px-2 py-1 text-sm text-[#F5F5F7] focus:border-[#D72638]/50 focus:outline-none"
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
            className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-3 py-1 text-sm font-medium text-[#F5F5F7] transition hover:bg-white/[0.09]"
          >
            Save link
          </button>
        </form>

        {comparison ? (
          <>
            {/* Accuracy targets (Day 65): headline metrics vs their error budgets. */}
            <div className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                Accuracy vs targets
              </p>
              <div className="space-y-1">
                {comparison.accuracy.map((a) => (
                  <div key={a.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-[#A0A2A8]">{a.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[#6B7280]">
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
              <p className="mt-2 text-xs text-[#6B7280]">
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
              const timing: BenchmarkComparisonRow[] = [];
              for (const r of comparison.rows) {
                if (HIDDEN_COMPARISON_KEYS.has(r.key)) continue; // per-side freq hidden (Day 74)
                const tier = classifyMetric(r.key, activeFps);
                if (tier === "requiresHigherFps") timing.push(r);
                else if (tier === "diagnostic") diagnostic.push(r);
                else primary.push(r);
              }
              return (
                <>
                  <p className="mb-2 text-xs text-[#6B7280]">
                    AVA vs <span className="font-medium text-[#A0A2A8]">{comparison.benchmarkName}</span> —
                    percent error per metric. Gold ≤10%, bronze ≤25%, red alert &gt;25%.
                  </p>
                  {primary.length > 0 && <ComparisonTable rows={primary} />}

                  {diagnostic.length > 0 && (
                    <details className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                      <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                        Per-side detail (diagnostic) — left/right asymmetry
                      </summary>
                      <div className="mt-2">
                        <ComparisonTable rows={diagnostic} muted />
                      </div>
                      <p className="mt-2 text-xs text-[#6B7280]">
                        Small left/right differences are diagnostic detail, not headline numbers —
                        the per-side spread is near the detection/frame-rate noise floor.
                      </p>
                    </details>
                  )}

                  {timing.length > 0 && (
                    <AvaCautionPanel
                      className="mt-3"
                      title="Coming Soon"
                      subtitle="Timing — requires higher FPS"
                      pill={`${activeFps ?? "Low"} FPS`}
                      description={PRECISION_TIMING_MESSAGE}
                      watermark={false}
                    >
                      <ComparisonTable rows={timing} muted />
                    </AvaCautionPanel>
                  )}
                </>
              );
            })()}
          </>
        ) : (
          <p className="text-xs text-[#6B7280]">
            Link this session to a benchmark to validate every calculated metric against the
            reference and report percent error. Comparisons only appear for an explicitly linked
            session.
          </p>
        )}
      </div>
    </AvaPanel>
  );
}
