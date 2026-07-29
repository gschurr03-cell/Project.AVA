import type { ReactNode } from "react";
import type { SprintAnalysisReport } from "@/lib/analysisReport";
import { formatPercent, formatReportDate, formatReportNumber } from "@/lib/analysisReport";
import { IMPACT_LABEL_TEXT } from "@/lib/limitingFactors";

function Section({ id, title, children, className = "" }: {
  id: string; title: string; children: ReactNode; className?: string;
}) {
  return (
    <section id={id} className={`report-section border-b border-white/10 py-8 last:border-0 ${className}`}>
      <h2 className="report-section-title mb-5 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[#7e8797]">{children}</p>;
}

export default function ReportDocument({ report }: { report: SprintAnalysisReport }) {
  const coachDepth = report.audience !== "athlete";
  return (
    <article className="analysis-report-paper overflow-hidden rounded-3xl border border-white/10 bg-[#101827] shadow-2xl">
      <header className="report-cover flex min-h-[620px] flex-col justify-between p-8 sm:p-12">
        <div>
          <div className="flex items-center justify-between gap-6">
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#3b8eff]">AVA Sprint</p>
            {report.branding.organizationName && <p className="text-sm text-[#b3bccb]">{report.branding.organizationName}</p>}
          </div>
          <div className="mt-24 max-w-3xl">
            <p className="text-sm uppercase tracking-[0.2em] text-[#7e8797]">{report.identity.subtitle}</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-6xl">{report.identity.title}</h1>
            <p className="mt-8 text-2xl text-[#d8dee9]">{report.athlete.displayName}</p>
            <p className="mt-2 text-[#b3bccb]">{report.session.name} · {formatReportDate(report.session.sessionDate)}</p>
          </div>
        </div>
        <dl className="grid gap-5 border-t border-white/10 pt-6 text-sm sm:grid-cols-3">
          <div><dt className="text-[#7e8797]">Sprint context</dt><dd className="mt-1">{report.session.sprintContext}</dd></div>
          <div><dt className="text-[#7e8797]">Measured zone</dt><dd className="mt-1">{report.session.zoneDistanceM != null ? formatReportNumber(report.session.zoneDistanceM, "m", 1) : "Unavailable"}</dd></div>
          <div><dt className="text-[#7e8797]">Report reference</dt><dd className="mt-1 font-mono">{report.identity.reference}</dd></div>
        </dl>
      </header>

      <div className="report-body px-6 sm:px-10">
        <Section id="executive-summary" title="Executive Summary" className="report-keep-together">
          <dl className="grid gap-5 sm:grid-cols-2">
            <SummaryItem label="Primary Finding" value={report.executiveSummary.primaryFinding} />
            <SummaryItem label="Performance Strength" value={report.executiveSummary.performanceStrength} />
            <SummaryItem label="Primary Training Direction" value={report.executiveSummary.primaryTrainingDirection} />
            <SummaryItem
              label="Analysis Confidence"
              value={`${report.executiveSummary.confidenceLabel}${report.executiveSummary.confidenceScore != null ? ` · ${formatPercent(report.executiveSummary.confidenceScore)}` : ""}`}
            />
            <div className="sm:col-span-2"><SummaryItem label="Important Context" value={report.executiveSummary.importantContext} /></div>
          </dl>
        </Section>

        <Section id="analysis-context" title="Analysis Context">
          <dl className="report-context-grid grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <ContextItem label="Zone type" value={report.session.zoneType} />
            <ContextItem label="Zone distance" value={report.session.zoneDistanceM != null ? formatReportNumber(report.session.zoneDistanceM, "m", 1) : "Unavailable"} />
            <ContextItem label="Video frame rate" value={report.session.videoFps != null ? `${report.session.videoFps} FPS` : "Unavailable"} />
            <ContextItem label="Calibration" value={report.session.calibrationMethod} />
            <ContextItem label="Valid steps" value={report.session.validSteps?.toString() ?? "Unavailable"} />
            <ContextItem label="Analysis date" value={formatReportDate(report.session.analysisDate)} />
            {coachDepth && <ContextItem label="Metric engine" value={report.versions.metricEngine} />}
            {coachDepth && <ContextItem label="Intelligence model" value={report.versions.sprintIntelligence} />}
            {coachDepth && <ContextItem label="Recommendation model" value={report.versions.coachingRecommendations} />}
          </dl>
          {coachDepth && report.session.sessionNotes && <p className="mt-5 text-sm"><strong>Session notes:</strong> {report.session.sessionNotes}</p>}
        </Section>

        <Section id="metrics" title="Core Performance Metrics">
          <div className="overflow-x-auto">
            <table className="report-metrics-table w-full border-collapse text-left text-sm">
              <thead><tr className="border-b border-white/10 text-[#7e8797]"><th scope="col" className="pb-3 pr-5">Metric</th><th scope="col" className="pb-3 pr-5">Result</th><th scope="col" className="pb-3 pr-5">Comparison</th><th scope="col" className="pb-3">Confidence</th></tr></thead>
              <tbody>{report.metrics.map((metric) => (
                <tr key={metric.key} className="report-metric-row border-b border-white/[0.06] last:border-0">
                  <th scope="row" className="py-4 pr-5 font-medium">{metric.name}<span className="mt-1 block max-w-md text-xs font-normal text-[#7e8797]">{metric.definition}</span></th>
                  <td className="py-4 pr-5 text-lg font-semibold">{metric.formattedValue}</td>
                  <td className="py-4 pr-5 text-[#b3bccb]">{metric.comparison}</td>
                  <td className="py-4 text-[#b3bccb]">{metric.confidence}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Section>

        <Section id="limiting-factors" title="Limiting Factors">
          {report.limitingFactors.length ? <div className="space-y-4">{report.limitingFactors.map((limiter) => (
            <article key={limiter.id} className="report-card report-keep-together rounded-2xl border border-white/10 p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-widest text-[#3b8eff]">#{limiter.rank} Performance limiter</p><h3 className="mt-1 text-lg font-semibold">{limiter.title}</h3></div>
                <p className="text-sm">{IMPACT_LABEL_TEXT[limiter.impact.level]} impact · {formatPercent(limiter.confidence.overall)} confidence</p>
              </div>
              <p className="mt-3 text-sm text-[#b3bccb]">{limiter.summary}</p>
              {coachDepth && <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><h4 className="report-label">Measured evidence</h4>{limiter.evidence.slice(0, 4).map((e) => <p key={`${e.label}-${e.value}`} className="mt-1 text-sm">{e.label}: {e.value}</p>)}</div>
                <div><h4 className="report-label">Why it matters</h4><p className="mt-1 text-sm">{limiter.impact.explanation}</p><p className="mt-2 text-xs text-[#7e8797]">{limiter.target.sourceLabel ?? "No validated external target."}</p></div>
              </div>}
            </article>
          ))}</div> : <Empty>No meaningful limiter met the evidence threshold for this analysis.</Empty>}
        </Section>

        <Section id="intelligence" title="Why AVA Reached This Conclusion">
          {report.intelligence.primary ? (
            <div className="report-keep-together">
              <h3 className="font-semibold">{report.intelligence.primary.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#b3bccb]">{report.intelligence.primary.detailedExplanation}</p>
              <p className="mt-3 text-sm"><strong>Interpretation:</strong> {report.intelligence.primary.interpretation}</p>
              {coachDepth && report.intelligence.counterEvidence.length > 0 && <div className="mt-4"><h4 className="report-label">Counter-evidence</h4>{report.intelligence.counterEvidence.map((e) => <p key={`${e.label}-${e.value}`} className="mt-1 text-sm text-[#b3bccb]">• {e.value}</p>)}</div>}
            </div>
          ) : <Empty>No reliable primary conclusion was available.</Empty>}
        </Section>

        {report.strengths.length > 0 && <Section id="strengths" title="Performance Strengths">
          {report.strengths.map((strength) => <article key={strength.id} className="report-keep-together mb-4"><h3 className="font-semibold">{strength.title}</h3><p className="mt-1 text-sm text-[#b3bccb]">{strength.conciseSummary}</p></article>)}
        </Section>}

        {report.asymmetry && <Section id="asymmetry" title="Left–Right Analysis">
          <article className="report-card report-keep-together rounded-2xl border border-white/10 p-5">
            <h3 className="font-semibold">{report.asymmetry.title}</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">{report.asymmetry.measuredValues.map((value) => <ContextItem key={value.label} label={value.label} value={value.value != null ? `${value.value} ${value.unit}${value.detail ? ` · ${value.detail}` : ""}` : "Unavailable"} />)}</div>
            <p className="mt-4 text-sm"><strong>Difference:</strong> {report.asymmetry.percentage != null ? `${report.asymmetry.percentage.toFixed(1)}%` : "Unavailable"} · {report.asymmetry.confidence} confidence</p>
            <p className="mt-2 text-sm text-[#b3bccb]">{report.asymmetry.interpretation}</p>
            <p className="mt-2 text-xs text-[#7e8797]">{report.asymmetry.limitation}</p>
          </article>
        </Section>}

        <Section id="recommendations" title="Coaching Recommendations">
          {report.recommendations.length ? <div className="space-y-4">{report.recommendations.map((rec, index) => (
            <article key={rec.id} className="report-card report-keep-together rounded-2xl border border-white/10 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-[#3b8eff]">{index === 0 ? "Primary direction" : "Supporting direction"} · {rec.category.replaceAll("_", " ")}</p>
              <h3 className="mt-1 font-semibold">{rec.title}</h3>
              <p className="mt-2 text-sm text-[#b3bccb]">{rec.rationale}</p>
              {rec.implementationGuidance.map((item) => <p key={item} className="mt-2 text-sm">• {item}</p>)}
              {rec.observationCues.length > 0 && <p className="mt-3 text-sm"><strong>Observe:</strong> {rec.observationCues.join(" · ")}</p>}
              {rec.cautions.map((item) => <p key={item} className="mt-2 text-xs text-[#f5c451]"><strong>Caution:</strong> {item}</p>)}
            </article>
          ))}</div> : <Empty>No intervention direction met AVA&apos;s evidence threshold.</Empty>}
        </Section>

        {(report.additionalTesting.length > 0 || report.intelligence.missingInputs.length > 0) && <Section id="missing-inputs" title="Additional Testing and Missing Inputs">
          {report.additionalTesting.map((item) => <div key={item.id} className="report-keep-together mb-4"><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-sm text-[#b3bccb]">{item.summary}</p></div>)}
          {report.intelligence.missingInputs.map((item) => <div key={item.id} className="report-keep-together mb-4"><h3 className="font-semibold">{item.label}</h3><p className="mt-1 text-sm text-[#b3bccb]">{item.wouldImprove}</p></div>)}
        </Section>}

        <Section id="quality" title="Data Quality and Confidence">
          <dl className="grid gap-4 sm:grid-cols-3">
            <SummaryItem label="Measurement Confidence" value={formatPercent(report.dataQuality.measurementConfidence)} />
            <SummaryItem label="Reasoning Confidence" value={formatPercent(report.dataQuality.reasoningConfidence)} />
            <SummaryItem label="Overall Confidence" value={formatPercent(report.dataQuality.overallConfidence)} />
          </dl>
          <p className="mt-5 text-sm text-[#b3bccb]">Calibration: {report.dataQuality.calibrationConfirmed ? "Confirmed" : "Unavailable"} · Valid steps: {report.dataQuality.validSteps ?? "Unavailable"}</p>
          {report.dataQuality.warnings.map((warning) => <p key={warning} className="mt-2 text-sm text-[#b3bccb]">• {warning}</p>)}
        </Section>

        <Section id="history" title="Progress and Historical Comparison">
          <p className="text-sm text-[#b3bccb]">{report.history.summary}</p>
        </Section>

        <Section id="methodology" title="Methodology and Scientific Limitations">
          <div className="space-y-3 text-sm text-[#b3bccb]">
            <p><strong>Metrics:</strong> {report.methodology.metricsUsed.join(", ")}.</p>
            <p><strong>Target basis:</strong> {report.methodology.targetBasis}</p>
            <p><strong>Limiter ranking:</strong> {report.methodology.limiterRanking}</p>
            <p><strong>Confidence:</strong> {report.methodology.confidenceBasis}</p>
            <p><strong>Recommendation boundary:</strong> {report.methodology.recommendationsBoundary}</p>
          </div>
          <div className="mt-6 rounded-xl border border-white/10 p-4">{report.disclaimers.map((text) => <p key={text} className="mb-2 text-sm last:mb-0">{text}</p>)}</div>
          <dl className="mt-6 grid gap-2 text-xs text-[#7e8797] sm:grid-cols-2">
            {Object.entries(report.versions).map(([key, value]) => <div key={key}><dt className="inline capitalize">{key.replaceAll(/([A-Z])/g, " $1")}:</dt> <dd className="inline">{value}</dd></div>)}
          </dl>
        </Section>
      </div>
      <footer className="report-footer flex flex-wrap justify-between gap-3 border-t border-white/10 px-6 py-5 text-xs text-[#7e8797] sm:px-10">
        <span>{report.branding.avaAttribution}</span>
        <span>{report.identity.reference} · Generated {formatReportDate(report.generatedAt)}</span>
      </footer>
    </article>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div className="report-summary-item rounded-xl bg-white/[0.035] p-4"><dt className="report-label">{label}</dt><dd className="mt-2 text-sm leading-relaxed">{value}</dd></div>;
}
function ContextItem({ label, value }: { label: string; value: string }) {
  return <div><dt className="report-label">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>;
}
