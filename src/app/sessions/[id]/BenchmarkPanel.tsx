import { setSessionBenchmark } from "@/app/sessions/actions";
import type { SprintMeasurements } from "@/lib/benchmark/measurements";
import type { AccuracyRow, BenchmarkComparisonRow, ComparisonStatus } from "@/lib/benchmark";

/**
 * Presentation only: AVA's full calibrated sprint measurement set, the active
 * FPS source, a benchmark link selector, and — when the session is linked to a
 * benchmark — the ground-truth validation table (AVA vs reference vs % error).
 * All numbers come from the pure engines; no logic here beyond formatting.
 */

const n2 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2));
const n1 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));
const int = (v: number | null | undefined) => (v == null ? "—" : String(v));

const CONF_BADGE: Record<string, string> = {
  high: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-200 text-gray-600",
};

const STATUS_BADGE: Record<ComparisonStatus, string> = {
  ok: "bg-green-100 text-green-700",
  warn: "bg-amber-100 text-amber-700",
  off: "bg-red-100 text-red-700",
  missing: "bg-gray-200 text-gray-500",
  info: "bg-sky-100 text-sky-700",
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
    <div className="rounded-md border bg-white p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-800">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
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
  fpsSource: "override" | "detected" | "none";
  detectedFps: number | null;
  fpsOverride: number | null;
  benchmarks: { id: string; name: string }[];
  linkedBenchmarkId: string | null;
  comparison: { benchmarkName: string; rows: BenchmarkComparisonRow[]; accuracy: AccuracyRow[] } | null;
}) {
  const m = measurements;
  const primaryVel = m.velocities.find((v) => v.key === "distanceTime")?.value ?? m.zoneVelocityMps;

  return (
    <section className="mt-6 rounded-lg border bg-gray-50 p-5">
      <h2 className="mb-1 text-xl font-bold text-lane">Sprint Measurements &amp; Benchmark</h2>
      <p className="mb-4 text-xs text-gray-500">
        Calibrated measurements from verified ground contacts and the manual zone. Step frequency,
        step length, contact time, and flight time are separate metrics and reported as such.
      </p>

      {/* FPS source */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border bg-white p-3 text-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Active FPS</span>
        <span className="text-lg font-bold text-gray-800">{activeFps ?? "—"}</span>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
            fpsSource === "override" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
          }`}
        >
          {fpsSource === "override" ? "manual override" : fpsSource === "detected" ? "detected" : "unknown"}
        </span>
        <span className="text-xs text-gray-400">
          detected {detectedFps ?? "—"} · override {fpsOverride ?? "—"} · drives all timing
          (contact, flight, frequency, zone, velocity, phases)
        </span>
      </div>

      {/* Camera-motion compensation status (Day 64) */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border bg-white p-3 text-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Camera compensation
        </span>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
            m.cameraCompensation.confidence === "high"
              ? "bg-green-100 text-green-700"
              : m.cameraCompensation.confidence === "medium"
                ? "bg-amber-100 text-amber-700"
                : m.cameraCompensation.confidence === "low"
                  ? "bg-orange-100 text-orange-700"
                  : "bg-gray-200 text-gray-600"
          }`}
        >
          {m.cameraCompensation.confidence}
        </span>
        <span className="text-xs text-gray-500">
          {m.cameraCompensation.available
            ? `Spatial metrics use stabilized world coordinates · ${Math.round(m.cameraCompensation.coverage * 100)}% frame coverage`
            : "Not compensated — spatial metrics use raw frame coordinates"}
        </span>
      </div>
      {m.cameraCompensation.warning && (
        <p className="mb-4 rounded border border-orange-300 bg-orange-50 px-3 py-2 text-xs text-orange-800">
          ⚠ {m.cameraCompensation.warning}
        </p>
      )}

      {/* Diagnostics: which frames/contacts were included/excluded (Day 65) */}
      <details className="mb-4 rounded-md border bg-white p-3 text-sm">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-gray-400">
          Diagnostics — frames &amp; contacts used
        </summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-gray-500">Tracking coverage</dt>
          <dd className="font-mono text-gray-800">
            {Math.round(m.diagnostics.trackingCoverage * 100)}% ({m.diagnostics.trackedFrames}/
            {m.diagnostics.totalFrames} frames with a tracked foot)
          </dd>
          <dt className="text-gray-500">First / last contact</dt>
          <dd className="font-mono text-gray-800">
            {m.diagnostics.firstContactTimeS != null ? `${m.diagnostics.firstContactTimeS.toFixed(2)}s` : "—"}
            {" → "}
            {m.diagnostics.lastContactTimeS != null ? `${m.diagnostics.lastContactTimeS.toFixed(2)}s` : "—"}
          </dd>
          <dt className="text-gray-500">Contacts included in zone</dt>
          <dd className="font-mono text-gray-800">
            {m.diagnostics.includedContacts} of {m.totalContacts} detected
          </dd>
        </dl>
        {m.diagnostics.excludedContacts.length > 0 && (
          <p className="mt-2 text-xs text-gray-500">
            <span className="font-medium">Excluded:</span>{" "}
            {m.diagnostics.excludedContacts
              .map((c) => `${c.side[0].toUpperCase()}@${c.time.toFixed(2)}s (${c.reason})`)
              .join("; ")}
          </p>
        )}
        {m.diagnostics.notes.map((n) => (
          <p key={n} className="mt-2 text-xs text-amber-700">
            {n}
          </p>
        ))}
      </details>

      {!m.calibrated && (
        <p className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          No manual calibration yet — contact counts and cadence are shown, but step length and
          velocity need two calibration gates a known distance apart (Calibration gates on the overlay).
        </p>
      )}

      {/* Contacts + frequency */}
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Contacts &amp; frequency</h3>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Combined frequency"
          value={m.combinedStepFrequencyHz != null ? `${n2(m.combinedStepFrequencyHz)}` : "—"}
          sub="steps/s (primary)"
        />
        <Stat label="Left / Right freq" value={`${n2(m.leftStepFrequencyHz)} / ${n2(m.rightStepFrequencyHz)}`} sub="steps/s" />
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

      {/* Step length */}
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-700">Step length</h3>
        <span className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${CONF_BADGE[m.stepLengthConfidence]}`}>
          {m.stepLengthConfidence} confidence
        </span>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Avg (zone ÷ steps)" value={m.avgZoneStepLengthM != null ? `${n2(m.avgZoneStepLengthM)} m` : "—"} sub="trusted" />
        <Stat label="Avg (individual)" value={m.avgIndividualStepLengthM != null ? `${n2(m.avgIndividualStepLengthM)} m` : "—"} />
        <Stat label="Left step" value={m.leftStepLengthM != null ? `${n2(m.leftStepLengthM)} m` : "—"} />
        <Stat label="Right step" value={m.rightStepLengthM != null ? `${n2(m.rightStepLengthM)} m` : "—"} />
      </div>
      {m.calibrated && m.individualStepLengthsM.length > 0 && (
        <p className="mb-4 text-xs text-gray-500">
          <span className="font-medium">Individual steps:</span>{" "}
          {m.individualStepLengthsM.map((d, i) => `#${i + 1} ${d.toFixed(2)}m`).join(" · ")}
          {m.stepLengthConfidence !== "high" && (
            <span className="ml-1 text-amber-600">
              (lower confidence — trust the zone average above)
            </span>
          )}
        </p>
      )}

      {/* Velocity cross-check */}
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Velocity (cross-checked)</h3>
      <div className="mb-2 overflow-hidden rounded-md border bg-white">
        <table className="w-full text-sm">
          <tbody>
            {m.velocities.map((v) => (
              <tr key={v.key} className="border-b last:border-0">
                <td className="px-3 py-2 text-gray-600">{v.label}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-900">
                  {v.value != null ? `${n2(v.value)} m/s` : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-gray-400">{v.method}</td>
              </tr>
            ))}
            <tr className="border-b last:border-0 bg-gray-50">
              <td className="px-3 py-2 font-medium text-gray-700">Max velocity (longest step × cadence)</td>
              <td className="px-3 py-2 text-right font-mono text-gray-900">
                {m.maxVelocityMps != null ? `${n2(m.maxVelocityMps)} m/s` : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-gray-400">peak step</td>
            </tr>
          </tbody>
        </table>
      </div>
      {m.velocitySpreadPct != null && (
        <p className={`mb-4 text-xs ${m.velocitySpreadPct > 15 ? "text-amber-600" : "text-gray-500"}`}>
          Methods spread {n1(m.velocitySpreadPct)}% · {m.velocityNote}
          {primaryVel != null && ` · zone velocity ${n2(primaryVel)} m/s`}
        </p>
      )}

      {/* Benchmark link + validation */}
      <div className="mt-5 rounded-md border bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Benchmark validation</h3>
        <form action={setSessionBenchmark} className="mb-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={sessionId} />
          <label htmlFor="benchmark_id" className="text-xs text-gray-500">
            Compare against
          </label>
          <select
            id="benchmark_id"
            name="benchmark_id"
            defaultValue={linkedBenchmarkId ?? ""}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="">Not linked</option>
            {benchmarks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded bg-lane px-3 py-1 text-sm text-white">
            Save link
          </button>
        </form>

        {comparison ? (
          <>
            {/* Accuracy targets (Day 65): headline metrics vs their error budgets. */}
            <div className="mb-4 rounded-md border bg-gray-50 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                Accuracy vs targets
              </p>
              <div className="space-y-1">
                {comparison.accuracy.map((a) => (
                  <div key={a.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-gray-700">{a.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-500">
                        {a.errorPct != null ? `${a.errorPct.toFixed(1)}%` : "—"} / ≤{a.targetPct}%
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          a.status === "pass"
                            ? "bg-green-100 text-green-700"
                            : a.status === "fail"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        {a.status === "pass" ? "✓ meets" : a.status === "fail" ? "over target" : "n/a"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Frequency is temporal (high confidence). Spatial metrics depend on calibration + camera
                compensation; when over target the diagnostics above explain why (partial early tracking,
                camera-pan estimation). Average step length uses the trusted zone method (distance ÷ steps).
              </p>
            </div>

            <p className="mb-2 text-xs text-gray-500">
              AVA vs <span className="font-medium">{comparison.benchmarkName}</span> — percent error
              per metric. Green ≤10%, amber ≤25%, red &gt;25%.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-2 py-1">Metric</th>
                    <th className="px-2 py-1 text-right">AVA</th>
                    <th className="px-2 py-1 text-right">Benchmark</th>
                    <th className="px-2 py-1 text-right">% error</th>
                    <th className="px-2 py-1 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((r) => (
                    <tr key={r.key} className="border-b last:border-0">
                      <td className="px-2 py-1.5 text-gray-700">
                        {r.label}
                        {r.unit && <span className="ml-1 text-xs text-gray-400">({r.unit})</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-900">
                        {r.avaValue != null ? r.avaValue.toFixed(2) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-900">
                        {r.benchmarkValue != null ? r.benchmarkValue.toFixed(2) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-gray-900">
                        {r.percentError != null ? `${r.percentError.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-500">
            Link this session to a benchmark to validate every calculated metric against the
            reference and report percent error. Comparisons only appear for an explicitly linked
            session.
          </p>
        )}
      </div>
    </section>
  );
}
