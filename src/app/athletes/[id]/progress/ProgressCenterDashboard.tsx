"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  compareProgressPoints,
  type HistoricalMetricKey,
  type MetricTrend,
  type ProgressCenterReport,
} from "@/lib/progressCenter";

const PANEL = "rounded-2xl border border-white/[0.06] bg-[#101827]/95 p-5";
const LABEL = "text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]";
const arrow = { improving: "↑", stable: "→", declining: "↓", insufficient: "·" } as const;
const tone = { improving: "text-emerald-300", stable: "text-[#b3bccb]", declining: "text-red-300", insufficient: "text-[#7e8797]" } as const;

function TrendChart({ trend, range, zoom }: { trend: MetricTrend; range: number | null; zoom: number }) {
  const filtered = useMemo(() => {
    const cutoff = range == null ? 0 : Date.now() - range * 86_400_000;
    return trend.points.filter((point) => new Date(point.date).getTime() >= cutoff).slice(-zoom);
  }, [trend, range, zoom]);
  if (filtered.length < 2) return <div className="grid h-56 place-items-center text-sm text-[#7e8797]">More comparable sessions needed.</div>;
  const values = filtered.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const xy = filtered.map((point, index) => ({
    ...point,
    x: 30 + index / Math.max(1, filtered.length - 1) * 640,
    y: 190 - (point.value - min) / spread * 150,
  }));
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 700 230" role="img" aria-label={`${trend.label} historical chart`} className="min-w-[620px]">
        {[40, 90, 140, 190].map((y) => <line key={y} x1="30" y1={y} x2="670" y2={y} stroke="rgba(255,255,255,.06)" />)}
        <polyline points={xy.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#2f80ed" strokeWidth="3" />
        {xy.map((point) => (
          <g key={point.analysisId}>
            <circle cx={point.x} cy={point.y} r="5" fill="#f5f7fb" stroke="#2f80ed" strokeWidth="3">
              <title>{`${new Date(point.date).toLocaleDateString()} · ${point.value.toFixed(2)} ${trend.unit} · ${point.sessionName}`}</title>
            </circle>
            <text x={point.x} y="215" textAnchor="middle" fill="#7e8797" fontSize="10">
              {new Date(point.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </text>
          </g>
        ))}
        <text x="35" y="28" fill="#b3bccb" fontSize="11">{max.toFixed(2)} {trend.unit}</text>
        <text x="35" y="205" fill="#b3bccb" fontSize="11">{min.toFixed(2)} {trend.unit}</text>
      </svg>
    </div>
  );
}

function Collapsible({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className={PANEL}>
      <summary className="cursor-pointer list-none text-lg font-semibold text-[#f5f7fb]">{title}</summary>
      <div className="mt-4 border-t border-white/[0.06] pt-4">{children}</div>
    </details>
  );
}

export default function ProgressCenterDashboard({
  athlete,
  report,
}: {
  athlete: { id: string; fullName: string; personalBests: Array<{ label: string; value: number | null; unit: string }> };
  report: ProgressCenterReport;
}) {
  const [metricKey, setMetricKey] = useState<HistoricalMetricKey>(report.trends[0]?.key ?? "peakVelocity");
  const [range, setRange] = useState<number | null>(null);
  const [zoom, setZoom] = useState(12);
  const [leftId, setLeftId] = useState(report.points.at(-2)?.analysisId ?? "");
  const [rightId, setRightId] = useState(report.points.at(-1)?.analysisId ?? "");
  const trend = report.trends.find((item) => item.key === metricKey) ?? report.trends[0];
  const left = report.points.find((point) => point.analysisId === leftId);
  const right = report.points.find((point) => point.analysisId === rightId);
  const comparison = left && right && left.analysisId !== right.analysisId ? compareProgressPoints(left, right) : null;
  const latest = report.points.at(-1);
  const comparePreset = (kind: "previous" | "pb" | "month") => {
    if (!latest) return;
    const earlier =
      kind === "previous"
        ? report.points.at(-2)
        : kind === "pb"
          ? trend?.personalBest
          : [...report.points].reverse().find((point) =>
              new Date(point.date).getTime() <= new Date(latest.date).getTime() - 30 * 86_400_000);
    if (earlier && earlier.analysisId !== latest.analysisId) {
      setLeftId(earlier.analysisId);
      setRightId(latest.analysisId);
    }
  };

  return (
    <main className="ava-carbon mx-auto min-h-screen max-w-7xl p-4 pb-12 sm:p-8">
      <Link href={`/athletes/${athlete.id}`} className="text-sm text-[#b3bccb] hover:text-white">← Athlete dashboard</Link>
      <header className="mb-6 mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#2f80ed]">Athlete Progress Center</p>
        <h1 className="mt-1 text-3xl font-bold text-[#f5f7fb]">{athlete.fullName}</h1>
        <p className="mt-1 text-sm text-[#b3bccb]">Longitudinal performance from original analysis results.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={PANEL}><p className={LABEL}>Analyzed sessions</p><p className="mt-2 text-3xl font-bold">{report.points.length}</p></div>
        <div className={PANEL}><p className={LABEL}>Highest priority</p><p className="mt-2 text-xl font-bold">{report.highestPriorityLimiter?.label ?? "Resolved"}</p><p className="text-xs text-[#7e8797]">{report.highestPriorityLimiter ? `${report.highestPriorityLimiter.priorityScore}/100` : "No supported limiter"}</p></div>
        <div className={PANEL}><p className={LABEL}>Current confidence</p><p className="mt-2 text-3xl font-bold">{report.currentConfidence?.toFixed(0) ?? "—"}%</p></div>
        <div className={PANEL}><p className={LABEL}>Latest recording quality</p><p className="mt-2 text-3xl font-bold">{report.latestRecordingQuality?.toFixed(0) ?? "—"}<span className="text-base text-[#7e8797]">/100</span></p></div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Collapsible title="Performance Summary" open>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><p className={LABEL}>Current PBs</p><p className="mt-1 text-2xl font-bold">{report.currentPbs.length}</p></div>
            <div><p className={LABEL}>Areas improving</p><p className="mt-1 text-2xl font-bold text-emerald-300">{report.improving.length}</p></div>
            <div><p className={LABEL}>Areas regressing</p><p className="mt-1 text-2xl font-bold text-red-300">{report.regressing.length}</p></div>
          </div>
          {latest && <p className="mt-3 text-xs text-[#7e8797]">Latest: {latest.sessionName} · {new Date(latest.date).toLocaleString()}</p>}
        </Collapsible>

        <Collapsible title="Current PBs" open>
          <div className="space-y-2">
            {athlete.personalBests.map((pb) => <p key={pb.label} className="flex justify-between text-sm"><span className="text-[#b3bccb]">{pb.label}</span><strong>{pb.value ?? "—"} {pb.value != null ? pb.unit : ""}</strong></p>)}
            {report.currentPbs.map((pb) => <p key={pb.key} className="flex justify-between text-sm"><span className="text-[#b3bccb]">{pb.label} analysis best</span><strong>{pb.personalBest?.metrics[pb.key]?.value.toFixed(2)} {pb.unit}</strong></p>)}
          </div>
        </Collapsible>
        <Collapsible title="Recent Improvements">
          {report.recentImprovements.length ? <ul className="space-y-2">{report.recentImprovements.map((item) => <li key={item.key} className="text-sm text-[#b3bccb]"><span className="font-medium text-emerald-300">↑ {item.label}</span> · {Math.abs(item.changePct).toFixed(1)}% across {item.points.length} sessions</li>)}</ul> : <p className="text-sm text-[#7e8797]">No evidence-backed improvement yet.</p>}
        </Collapsible>
      </div>

      <div className="mt-4"><Collapsible title="Performance Trends & Historical Charts" open>
        {trend ? <>
          <div className="flex flex-wrap gap-2">
            <select value={metricKey} onChange={(event) => setMetricKey(event.target.value as HistoricalMetricKey)} className="rounded-lg border border-white/10 bg-[#182233] px-3 py-2 text-sm">
              {report.trends.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
            {[30, 90, null].map((days) => <button key={days ?? "all"} onClick={() => setRange(days)} className={`rounded-lg border px-3 py-2 text-xs ${range === days ? "border-[#2f80ed] text-white" : "border-white/10 text-[#b3bccb]"}`}>{days ? `${days} days` : "All time"}</button>)}
            <label className="flex items-center gap-2 text-xs text-[#b3bccb]">Zoom <input type="range" min="2" max={Math.max(2, trend.points.length)} value={Math.min(zoom, Math.max(2, trend.points.length))} onChange={(event) => setZoom(Number(event.target.value))} /></label>
          </div>
          <TrendChart trend={trend} range={range} zoom={zoom} />
          <p className={`text-sm font-medium ${tone[trend.direction]}`}>{arrow[trend.direction]} {trend.summary}</p>
        </> : <p className="text-sm text-[#7e8797]">No comparable historical metrics yet.</p>}
      </Collapsible></div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Collapsible title="PB Timeline">
          <div className="space-y-3">{report.trends.filter((item) => item.personalBest).map((item) => <div key={item.key} className="rounded-lg bg-white/[0.03] p-3 text-sm"><strong>{item.label}</strong><p className="text-[#b3bccb]">PB {item.personalBest?.metrics[item.key]?.value.toFixed(2)} {item.unit} · {new Date(item.personalBest!.date).toLocaleDateString()} · {item.personalBest?.sessionName}</p><p className="text-xs text-[#7e8797]">Season best: {item.seasonBest?.metrics[item.key]?.value.toFixed(2) ?? "—"} · Recent best: {item.recentBest?.metrics[item.key]?.value.toFixed(2) ?? "—"}</p><p className="text-xs text-[#7e8797]">{item.personalBest?.conditions.join(" · ")}</p></div>)}</div>
        </Collapsible>
        <Collapsible title="Sprint Intelligence Progress">
          <div className="space-y-4">{report.limiterEvolution.length ? report.limiterEvolution.map((limiter) => <div key={limiter.key}><p className="text-sm font-semibold">{limiter.label}</p><div className="mt-2 flex items-center gap-1">{limiter.points.map((point, index) => <div key={`${point.date}:${index}`} title={`${new Date(point.date).toLocaleDateString()}: ${point.status} ${point.score}`} className={`h-3 min-w-3 flex-1 rounded-full ${point.score >= 70 ? "bg-red-400" : point.score > 0 ? "bg-amber-400" : "bg-emerald-400"}`} />)}</div><p className="mt-1 text-xs text-[#7e8797]">High → Medium → Resolved</p></div>) : <p className="text-sm text-[#7e8797]">No supported limiter history.</p>}</div>
        </Collapsible>
      </div>

      <div className="mt-4"><Collapsible title="Comparison">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => comparePreset("previous")} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[#b3bccb]">Today vs previous</button>
          <button onClick={() => comparePreset("pb")} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[#b3bccb]">Today vs PB</button>
          <button onClick={() => comparePreset("month")} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[#b3bccb]">Today vs last month</button>
          {[{ value: leftId, set: setLeftId }, { value: rightId, set: setRightId }].map((control, index) => <select key={index} value={control.value} onChange={(event) => control.set(event.target.value)} className="rounded-lg border border-white/10 bg-[#182233] px-3 py-2 text-sm">{report.points.map((point) => <option key={point.analysisId} value={point.analysisId}>{point.sessionName} · {new Date(point.date).toLocaleDateString()}</option>)}</select>)}
        </div>
        {comparison ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-[#7e8797]"><tr><th>Metric</th><th>Earlier</th><th>Later</th><th>Change</th></tr></thead><tbody>{comparison.metrics.map((item) => <tr key={item.key} className="border-t border-white/[0.06]"><td className="py-2">{item.label}</td><td>{item.left.toFixed(2)}</td><td>{item.right.toFixed(2)}</td><td className={item.direction === "improved" ? "text-emerald-300" : item.direction === "declined" ? "text-red-300" : "text-[#b3bccb]"}>{item.direction} · {item.percentChange.toFixed(1)}%</td></tr>)}</tbody></table><p className="mt-3 text-xs text-[#7e8797]">Sprint Intelligence: {comparison.intelligenceDifference}</p></div> : <p className="mt-3 text-sm text-[#7e8797]">Select two different analyses.</p>}
      </Collapsible></div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Collapsible title="Evidence-backed Insights">{report.insights.length ? <ul className="space-y-2 text-sm text-[#b3bccb]">{report.insights.map((insight) => <li key={insight}>• {insight}</li>)}</ul> : <p className="text-sm text-[#7e8797]">More comparable sessions are needed.</p>}</Collapsible>
        <Collapsible title="Recent Sessions"><div className="space-y-2">{[...report.points].reverse().slice(0, 8).map((point) => <Link key={point.analysisId} href={`/sessions/${point.sessionId}`} className="block rounded-lg bg-white/[0.03] p-3 text-sm hover:bg-white/[0.06]"><strong>{point.sessionName}</strong><p className="text-xs text-[#7e8797]">{new Date(point.date).toLocaleString()} · {point.conditions.join(" · ")}</p></Link>)}</div></Collapsible>
      </div>
    </main>
  );
}
