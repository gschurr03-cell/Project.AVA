import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { FEATURES } from "@/lib/config/features";
import { explainableAnalysisResultSchema, type ExplainableAnalysisResult } from "@/lib/analysis/resultContract";
import { buildCompletedAnalysisObservationInput, generateObservationResult } from "@/lib/observations";
import { generateInterpretations, type InterpretationContext } from "@/lib/intelligence/interpretations";
import { generateRecommendations } from "@/lib/intelligence/recommendationEngine";
import { generatePriorities } from "@/lib/intelligence/priorityEngine";
import { composeCoachReport, type CoachReport } from "@/lib/intelligence/reports";
import { createClient } from "@/lib/supabase/server";

import { PrintReportButton } from "./PrintReportButton";

const metricValue = (metric: CoachReport["metricHighlights"][number]) =>
  metric.value == null ? "Unavailable" : `${Number(metric.value.toFixed(3))} ${metric.unit}`.trim();

const reportResearchEvidenceSchema = z.array(z.object({
  claimId: z.string(), evidenceGrade: z.string(), summary: z.string(),
  applicability: z.string(), conflicting: z.boolean(),
  citations: z.array(z.object({
    shortCitation: z.string(), formattedCitation: z.string(), url: z.string().url().nullable(),
  })),
}));

function buildReport(
  result: ExplainableAnalysisResult,
  audience: "athlete" | "coach",
  athleteName: string,
  sessionName: string,
  researchEvidence: z.infer<typeof reportResearchEvidenceSchema>,
) {
  const observationResult = generateObservationResult(buildCompletedAnalysisObservationInput({
    result, recordingQuality: null,
    calibrationAvailable: result.provenance.calibrationMode !== "none",
    asymmetryInsights: [],
  }));
  const fpsTier: InterpretationContext["fpsTier"] =
    result.provenance.sourceFpsClassification === "experimental_30_fps_class" ? "experimental_30"
      : result.provenance.sourceFpsClassification === "high_speed_source_normalized_to_60" ? "high_speed_normalized"
        : "validated_60";
  const context: InterpretationContext = {
    analysisId: result.analysisId, generatedAt: result.provenance.completedAt,
    phase: "unknown", cameraMode: result.provenance.cameraMode, fpsTier,
    calibrationAvailable: result.provenance.calibrationMode !== "none",
    event: null, sessionPurpose: result.inputSnapshot.session.analysisType,
    athleteId: result.athleteId, contextVersion: "ava-interpretation-context-v1",
    savedVersion: false,
  };
  const interpretations = generateInterpretations(
    { observations: observationResult.observations, context },
    undefined, { allowExperimental: FEATURES.experimentalInterpretations },
  );
  const recommendations = generateRecommendations({
    interpretations,
    context: {
      ...context, savedVersion: false,
      athlete: {
        athleteId: result.athleteId, trainingAge: "unknown", competitionLevel: "unknown",
        primaryEvent: null, goals: [], reportedPain: null, activeLimitation: null,
        contextVersion: "ava-athlete-recommendation-context-v1",
      },
    },
  }, undefined, {
    allowExperimental: FEATURES.experimentalRecommendations,
    allowAdvancedDrills: FEATURES.advancedDrillRecommendations,
    allowProfessionalReview: FEATURES.professionalReviewRecommendations,
  });
  const priorities = generatePriorities({
    observations: observationResult.observations, interpretations, recommendations,
    context: {
      analysisId: result.analysisId, generatedAt: result.provenance.completedAt,
      athleteGoals: [], primaryEvent: null, phase: "unknown", coachRelevantAreas: [],
      persistenceSignals: [], baselineSignals: [], contextVersion: "ava-priority-context-v1",
    },
  });
  return composeCoachReport({
    result, observations: observationResult.observations, interpretations,
    recommendations, priorities, audience, athleteName, sessionName, researchEvidence,
  });
}

export default async function SessionReportPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ audience?: string; analysis?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const audience = query.audience === "coach" ? "coach" : "athlete";
  if (!FEATURES.coachReportEngine || (audience === "coach" ? !FEATURES.coachReportView : !FEATURES.athleteReportView))
    notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: session } = await supabase
    .from("sessions")
    .select("id,name,athlete_id,current_working_analysis_id,athletes(full_name)")
    .eq("id", id).maybeSingle();
  if (!session) notFound();
  const { data: versions } = await supabase.from("analyses")
    .select("id,status,analysis_kind,is_current_working,saved_version_number,saved_at")
    .eq("session_id", id).in("analysis_kind", ["working", "saved"])
    .order("saved_version_number", { ascending: true });
  const selectedId = query.analysis ?? session.current_working_analysis_id;
  const selectedVersion = versions?.find((item) => item.id === selectedId) ?? null;
  const athlete = Array.isArray(session.athletes) ? session.athletes[0] : session.athletes;
  const base = `/sessions/${id}/report`;
  const suffix = selectedId ? `&analysis=${encodeURIComponent(selectedId)}` : "";

  if (!selectedVersion) return <ReportState title="Report unavailable" detail="Complete a working analysis before opening the Coach Report." back={`/sessions/${id}`} />;
  if (selectedVersion.status === "queued" || selectedVersion.status === "running")
    return <ReportState title="Report processing" detail="AVA will make the report available after the analysis finishes." back={`/sessions/${id}`} />;
  if (selectedVersion.status === "failed")
    return <ReportState title="Report unavailable" detail="The analysis failed and no report was created." back={`/sessions/${id}`} />;
  if (selectedVersion.analysis_kind === "saved")
    return <ReportState title="Saved report snapshot unavailable" detail="This saved analysis predates immutable Coach Report snapshots. AVA will not regenerate historical conclusions with current rules." back={`/sessions/${id}`} />;

  const { data: analysis } = await supabase.from("analyses")
    .select("id,status,result_payload").eq("session_id", id).eq("id", selectedVersion.id).maybeSingle();
  const parsed = explainableAnalysisResultSchema.safeParse(analysis?.result_payload);
  if (!parsed.success)
    return <ReportState title="Report evidence unavailable" detail="This analysis does not contain a valid explainable result contract, so AVA withheld the report." back={`/sessions/${id}`} />;
  const evidenceEnabled =
    audience === "coach" ? FEATURES.coachFacingEvidence : FEATURES.athleteFacingEvidence;
  const { data: rawResearchEvidence } = evidenceEnabled
    ? await supabase.rpc("retrieve_production_research_evidence", {
        p_metric_keys: parsed.data.measurements.map((item) => item.metricId),
        p_usage: audience === "coach" ? "coach_report" : "athlete_report",
        p_limit: audience === "coach" ? 5 : 3,
      })
    : { data: [] };
  const parsedResearchEvidence = reportResearchEvidenceSchema.safeParse(rawResearchEvidence);
  const report = buildReport(
    parsed.data,
    audience,
    athlete?.full_name ?? "Athlete",
    session.name ?? "Sprint session",
    parsedResearchEvidence.success ? parsedResearchEvidence.data : [],
  );
  return (
    <main className="report-shell mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      <nav className="report-no-print mb-6 flex flex-wrap items-center justify-between gap-3" aria-label="Report controls">
        <Link href={`/sessions/${id}`} className="text-sm text-[#b3bccb] hover:text-white">← Session</Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link aria-current={audience === "athlete" ? "page" : undefined} href={`${base}?audience=athlete${suffix}`} className="rounded-full border border-white/15 px-4 py-2 text-sm">Athlete view</Link>
          <Link aria-current={audience === "coach" ? "page" : undefined} href={`${base}?audience=coach${suffix}`} className="rounded-full border border-white/15 px-4 py-2 text-sm">Coach view</Link>
          {FEATURES.reportPrintExport ? <PrintReportButton /> : null}
        </div>
      </nav>
      <article className="report-paper rounded-3xl border border-white/10 bg-[#101827] p-5 shadow-2xl sm:p-9">
        <header className="border-b border-white/10 pb-7">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#2f80ed]">AVA Sprint Coach Report</p>
          <h1 className="mt-2 text-3xl font-semibold">{athlete?.full_name ?? "Athlete"}</h1>
          <p className="mt-1 text-[#b3bccb]">{session.name ?? "Sprint session"} · {audience === "coach" ? "Coach detail" : "Athlete summary"}</p>
          <div className={`mt-5 rounded-xl border p-4 ${report.trustBanner.experimental ? "border-[#f5c451]/40 bg-[#f5c451]/10" : "border-white/10 bg-white/[0.03]"}`}>
            <strong>{report.trustBanner.label}</strong><p className="mt-1 text-sm text-[#C7C7CC]">{report.trustBanner.summary}</p>
          </div>
        </header>
        <ReportSection title="Executive summary">
          {report.executiveSummary.map((line) => <p key={line} className="mb-2 text-[#D7D7DB]">{line}</p>)}
        </ReportSection>
        <ReportSection title="Top priorities">
          {report.topPriorities.length ? <div className="grid gap-4 lg:grid-cols-3">{report.topPriorities.map((item, index) => (
            <section key={item.priorityId} className="rounded-2xl border border-white/10 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-[#2f80ed]">Priority {index + 1}</p>
              <h3 className="mt-2 font-semibold">{item.title}</h3><p className="mt-2 text-sm text-[#b3bccb]">{item.whyItMatters}</p>
              <p className="mt-3 text-sm"><strong>Next action:</strong> {item.action}</p>
              <p className="mt-2 text-xs text-[#b3bccb]">{item.confidence} confidence · {item.expectedImpact} expected impact</p>
            </section>
          ))}</div> : <p className="text-[#b3bccb]">No action priority met AVA&apos;s evidence threshold.</p>}
        </ReportSection>
        {report.strengths.length ? <ReportSection title="Strengths to preserve">{report.strengths.map((item) => <p key={item.priorityId} className="mb-2"><strong>{item.title}:</strong> {item.summary}</p>)}</ReportSection> : null}
        <ReportSection title="Metric highlights">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{report.metricHighlights.map((metric) => (
            <div key={metric.metricId} className="rounded-xl bg-white/[0.035] p-4">
              <p className="text-xs uppercase tracking-wider text-[#b3bccb]">{metric.name}</p>
              <p className="mt-1 text-xl font-semibold">{metricValue(metric)}</p>
              <p className="mt-1 text-xs text-[#b3bccb]">{metric.status} · {metric.confidence} confidence</p>
            </div>
          ))}</div>
        </ReportSection>
        <ReportSection title="Measurement window">
          {parsed.data.provenance.zoneMetricSchemaVersion === "zone-step-metrics-v1" ? (
            <>
              <p><strong>Zone:</strong> Start → Finish</p>
              <p className="mt-2 text-sm text-[#b3bccb]">
                AVA counts contacts whose landing locations occur inside the calibrated zone.
                Step-length measurement begins at the first in-zone landing and ends at the
                first landing after the finish boundary.
              </p>
            </>
          ) : (
            <p className="text-[#b3bccb]">
              This analysis uses legacy step-window semantics. AVA will not silently
              present or compare it as a zone-step-metrics-v1 measurement; rerun the
              analysis with authoritative zone evidence to unlock this section.
            </p>
          )}
        </ReportSection>
        <ReportSection title="Technique and timing findings">
          {report.techniqueFindings.length ? report.techniqueFindings.map((item) => <div key={item.interpretationId} className="mb-4"><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-[#b3bccb]">{item.summary}</p><p className="mt-1 text-xs text-[#7e8797]">{item.confidence} confidence · {item.evidenceQuality} evidence</p></div>) : <p className="text-[#b3bccb]">No supported technique interpretation was available.</p>}
        </ReportSection>
        <ReportSection title="Monitoring plan">
          {report.monitoringPlan.length
            ? report.monitoringPlan.map((item) => <p key={item} className="mb-2">• {item}</p>)
            : <p className="text-[#b3bccb]">No monitoring criterion was supported beyond a compatible recapture.</p>}
        </ReportSection>
        <ReportSection title="Next capture">{report.nextCapture.map((item) => <p key={item} className="mb-2">• {item}</p>)}</ReportSection>
        {(report.unavailable.length || report.limitations.length) ? <ReportSection title="Limitations and unavailable evidence">
          {report.unavailable.map((item) => <p key={item.label} className="mb-2"><strong>{item.label}:</strong> {item.reason}</p>)}
          {report.limitations.map((item) => <p key={item} className="mb-2 text-[#b3bccb]">• {item}</p>)}
        </ReportSection> : null}
        {report.researchEvidence.length ? <ReportSection title={audience === "coach" ? "Research evidence" : "Research support"}>
          {report.researchEvidence.map((item) => <details key={item.claimId} className="mb-3 rounded-xl border border-white/10 p-4">
            <summary className="cursor-pointer font-semibold">{audience === "athlete" ? item.summary : `${item.evidenceGrade} evidence · ${item.summary}`}</summary>
            <p className="mt-2 text-sm text-[#b3bccb]">Applicability: {item.applicability}{item.conflicting ? " · Conflicting evidence is recorded." : ""}</p>
            {audience === "coach" ? item.citations.map((citation) => <p key={citation.shortCitation} className="mt-2 text-xs text-[#7e8797]">{citation.formattedCitation}</p>) : null}
          </details>)}
        </ReportSection> : null}
        <ReportSection title="Methodology">{report.methodology.map((item) => <p key={item} className="mb-2 text-sm text-[#b3bccb]">{item}</p>)}</ReportSection>
        {FEATURES.reportCompositionTrace ? <details className="report-no-print mt-8"><summary>Composition trace</summary><pre className="mt-3 overflow-auto text-xs">{JSON.stringify(report.compositionTrace, null, 2)}</pre></details> : null}
      </article>
    </main>
  );
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="border-b border-white/10 py-7 last:border-0"><h2 className="mb-4 text-xl font-semibold">{title}</h2>{children}</section>;
}
function ReportState({ title, detail, back }: { title: string; detail: string; back: string }) {
  return <main className="mx-auto flex min-h-screen max-w-xl items-center px-6"><section className="rounded-2xl border border-white/10 bg-[#101827] p-7"><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-3 text-[#b3bccb]">{detail}</p><Link href={back} className="mt-6 inline-block text-[#3b8eff]">Return to session</Link></section></main>;
}
