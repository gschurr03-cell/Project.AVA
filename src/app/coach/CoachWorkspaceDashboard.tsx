"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { compareAthletes, type CoachAthleteInput, type CoachRosterAthlete, type TeamAnalytics } from "@/lib/coachWorkspace";

const NAV = ["Dashboard", "Athletes", "Teams", "Sessions", "Analytics", "Reports", "Settings"];
const PANEL = "rounded-2xl border border-white/[0.06] bg-[#101827]/95 p-5";
const label = "text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]";
const statusTone = {
  on_track: "text-emerald-300 border-emerald-400/20",
  watch: "text-amber-300 border-amber-400/20",
  needs_attention: "text-red-300 border-red-400/20",
  no_data: "text-[#b3bccb] border-white/10",
};

export default function CoachWorkspaceDashboard({
  roster,
  analytics,
  athleteInputs,
}: {
  roster: CoachRosterAthlete[];
  analytics: TeamAnalytics;
  athleteInputs: CoachAthleteInput[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("attention");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [leftId, setLeftId] = useState(athleteInputs[0]?.id ?? "");
  const [rightId, setRightId] = useState(athleteInputs[1]?.id ?? "");
  const filtered = useMemo(() => {
    const data = roster.filter((athlete) =>
      (!query || `${athlete.name} ${athlete.event} ${athlete.highestPriorityLimiter ?? ""}`.toLowerCase().includes(query.toLowerCase())) &&
      (status === "all" || athlete.status === status) &&
      (!favoritesOnly || athlete.favorite));
    return [...data].sort((a, b) => sort === "name"
      ? a.name.localeCompare(b.name)
      : sort === "velocity"
        ? (b.latestPeakVelocity ?? -Infinity) - (a.latestPeakVelocity ?? -Infinity)
        : sort === "recent"
          ? (b.lastViewedAt ?? b.latestSessionDate ?? "").localeCompare(a.lastViewedAt ?? a.latestSessionDate ?? "")
          : roster.indexOf(a) - roster.indexOf(b));
  }, [favoritesOnly, query, roster, sort, status]);
  const left = athleteInputs.find((athlete) => athlete.id === leftId);
  const right = athleteInputs.find((athlete) => athlete.id === rightId);
  const comparison = left && right && left.id !== right.id ? compareAthletes(left, right) : null;

  return (
    <main className="ava-carbon min-h-screen text-[#f5f7fb]">
      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#2f80ed]">AVA Coach Workspace</p><h1 className="mt-1 text-3xl font-bold">Performance Command Center</h1></div>
          <Link href="/dashboard" className="rounded-lg border border-white/10 px-3 py-2 text-sm text-[#b3bccb]">Classic dashboard</Link>
        </header>
        <nav className="mt-5 flex gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-[#101827] p-1">
          {NAV.map((item, index) => <a key={item} href={`#${item.toLowerCase()}`} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${index === 0 ? "bg-[#2f80ed] text-white" : "text-[#b3bccb] hover:bg-white/[0.05]"}`}>{item}</a>)}
        </nav>

        <section id="dashboard" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={PANEL}><p className={label}>Athletes</p><p className="mt-2 text-3xl font-bold">{analytics.athleteCount}</p></div>
          <div className={PANEL}><p className={label}>Average peak velocity</p><p className="mt-2 text-3xl font-bold">{analytics.averagePeakVelocity?.toFixed(2) ?? "—"}<span className="text-sm text-[#7e8797]"> m/s</span></p></div>
          <div className={PANEL}><p className={label}>Improvement rate</p><p className="mt-2 text-3xl font-bold text-emerald-300">{analytics.improvementRate}%</p></div>
          <div className={PANEL}><p className={label}>Need attention</p><p className="mt-2 text-3xl font-bold text-red-300">{analytics.athletesNeedingAttention.length}</p></div>
        </section>

        <section id="athletes" className={`mt-5 ${PANEL}`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className={label}>Athlete Roster</p><h2 className="mt-1 text-xl font-semibold">Monitor every athlete</h2></div>
            <div className="flex flex-wrap gap-2">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search athletes…" className="rounded-lg border border-white/10 bg-[#182233] px-3 py-2 text-sm" />
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-white/10 bg-[#182233] px-3 py-2 text-sm"><option value="all">All statuses</option><option value="needs_attention">Needs attention</option><option value="watch">Watch</option><option value="on_track">On track</option><option value="no_data">No data</option></select>
              <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-white/10 bg-[#182233] px-3 py-2 text-sm"><option value="attention">Sort: attention</option><option value="name">Name</option><option value="velocity">Peak velocity</option><option value="recent">Recently viewed</option></select>
              <button onClick={() => setFavoritesOnly((value) => !value)} className={`rounded-lg border px-3 py-2 text-sm ${favoritesOnly ? "border-amber-400 text-amber-300" : "border-white/10 text-[#b3bccb]"}`}>★ Favorites</button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="text-[#7e8797]"><tr>{["Athlete", "Event / age", "Latest session", "Status", "Highest limiter", "Peak velocity", "Confidence", "Trend", "Recording"].map((heading) => <th key={heading} className="pb-3 pr-4">{heading}</th>)}</tr></thead>
              <tbody>{filtered.map((athlete) => <tr key={athlete.id} className="border-t border-white/[0.06]">
                <td className="py-3 pr-4"><Link href={`/athletes/${athlete.id}`} className="flex items-center gap-2 font-semibold hover:text-[#3b8eff]"><span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[#25252A] text-xs">{athlete.photoUrl ? <Image src={athlete.photoUrl} alt="" width={36} height={36} unoptimized className="h-full w-full object-cover" /> : athlete.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>{athlete.favorite && <span className="text-amber-300">★</span>}{athlete.name}</Link></td>
                <td className="pr-4">{athlete.event}<br/><span className="text-xs text-[#7e8797]">{athlete.ageGroup}</span></td>
                <td className="pr-4">{athlete.latestSession ?? "—"}<br/><span className="text-xs text-[#7e8797]">{athlete.latestSessionDate ? new Date(athlete.latestSessionDate).toLocaleDateString() : ""}</span></td>
                <td className="pr-4"><span title={athlete.statusReason} className={`rounded-full border px-2 py-1 text-xs ${statusTone[athlete.status]}`}>{athlete.status.replaceAll("_", " ")}</span></td>
                <td className="pr-4">{athlete.highestPriorityLimiter ?? "Resolved"}</td>
                <td className="pr-4">{athlete.latestPeakVelocity?.toFixed(2) ?? "—"} m/s</td>
                <td className="pr-4">{athlete.latestConfidence?.toFixed(0) ?? "—"}%</td>
                <td className="pr-4">{athlete.trendDirection === "improving" ? "↑ Improving" : athlete.trendDirection === "declining" ? "↓ Declining" : athlete.trendDirection === "stable" ? "→ Stable" : "—"}</td>
                <td>{athlete.recordingQuality?.toFixed(0) ?? "—"}/100</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section id="analytics" className={PANEL}><p className={label}>Team Analytics</p><div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-[#7e8797]">Avg contact time</span><p className="text-xl font-bold">{analytics.averageContactTime?.toFixed(0) ?? "—"} ms</p></div>
            <div><span className="text-[#7e8797]">Common limiter</span><p className="text-xl font-bold">{analytics.mostCommonLimiter ?? "None"}</p></div>
            <div><span className="text-[#7e8797]">Recording quality</span><p className="text-xl font-bold">{analytics.averageRecordingQuality?.toFixed(0) ?? "—"}/100</p></div>
            <div><span className="text-[#7e8797]">Most improved</span><p className="text-xl font-bold">{analytics.mostImprovedAthlete ?? "More data needed"}</p></div>
          </div><div className="mt-4 rounded-lg border border-white/[0.06] p-3 text-xs text-[#7e8797]">New injuries: future placeholder only. AVA does not infer injuries.</div></section>
          <section className={PANEL}><p className={label}>Athletes Needing Attention</p><div className="mt-3 space-y-2">{analytics.athletesNeedingAttention.length ? analytics.athletesNeedingAttention.map((athlete) => <Link key={athlete.id} href={`/athletes/${athlete.id}`} className="block rounded-lg bg-white/[0.03] p-3"><strong>{athlete.name}</strong><p className="text-xs text-[#b3bccb]">{athlete.statusReason}</p></Link>) : <p className="text-sm text-[#7e8797]">No evidence-backed alerts.</p>}</div></section>
        </div>

        <section id="teams" className={`mt-5 ${PANEL}`}><p className={label}>Comparison Tools</p><div className="mt-3 flex flex-wrap gap-2">{[{ value: leftId, set: setLeftId }, { value: rightId, set: setRightId }].map((item, index) => <select key={index} value={item.value} onChange={(event) => item.set(event.target.value)} className="rounded-lg border border-white/10 bg-[#182233] px-3 py-2 text-sm">{athleteInputs.map((athlete) => <option key={athlete.id} value={athlete.id}>{athlete.name}</option>)}</select>)}</div>
          {comparison ? <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-[#7e8797]"><tr><th>Metric</th><th>{comparison.left}</th><th>{comparison.right}</th><th>Difference</th></tr></thead><tbody>{comparison.metrics.map((metric) => <tr key={metric.key} className="border-t border-white/[0.06]"><td className="py-2">{metric.label}</td><td>{metric.left.toFixed(2)}</td><td>{metric.right.toFixed(2)}</td><td>{metric.difference >= 0 ? "+" : ""}{metric.difference.toFixed(2)}</td></tr>)}</tbody></table><p className="mt-3 text-xs text-[#7e8797]">Limiter: {comparison.limiterDifference} · Confidence difference: {comparison.confidenceDifference?.toFixed(0) ?? "—"} points</p></div> : <p className="mt-3 text-sm text-[#7e8797]">Select two different athletes.</p>}
        </section>

        <section id="sessions" className={`mt-5 grid gap-3 sm:grid-cols-3`}>
          <Link href="/dashboard" className={PANEL}><p className={label}>1. Upload</p><p className="mt-2 font-semibold">Choose an athlete and upload a session</p></Link>
          <div className={PANEL}><p className={label}>2. Review</p><p className="mt-2 font-semibold">Open completed analysis and evidence</p></div>
          <div className={PANEL}><p className={label}>3. Follow up</p><p className="mt-2 font-semibold">Leave structured notes and revisit progress</p></div>
        </section>
      </div>
    </main>
  );
}
