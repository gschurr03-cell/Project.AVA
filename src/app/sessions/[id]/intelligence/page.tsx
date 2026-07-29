import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/nav/AppShell";
import { loadSprintIntelligence } from "@/lib/sprintIntelligence/loadContext";
import { CONFIDENCE_LABEL_TEXT } from "@/lib/limitingFactors";
import ConclusionCard from "./ConclusionCard";

function Notice({ title, body, sessionId }: { title: string; body: string; sessionId: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#182233] p-8 text-center shadow-[0_8px_30px_rgba(0,0,0,0.24)]">
      <p className="text-lg font-semibold text-[#f5f7fb]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[#b3bccb]">{body}</p>
      <Link
        href={`/sessions/${sessionId}`}
        className="mt-5 inline-block rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#b3bccb] transition hover:bg-white/[0.08]"
      >
        Back to analysis
      </Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[#101827] p-5">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function SprintIntelligencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { report, sessionName, found } = await loadSprintIntelligence(id);
  if (!found) notFound();

  const blocked =
    !report ||
    report.status === "calibration_missing" ||
    report.status === "insufficient_data" ||
    report.status === "processing" ||
    report.status === "failed";

  const metaLine =
    report &&
    [
      `${report.summary.supportedConclusionCount} supported ${report.summary.supportedConclusionCount === 1 ? "conclusion" : "conclusions"}`,
      `Data quality: ${CONFIDENCE_LABEL_TEXT[report.summary.dataQualityLabel]}`,
      report.summary.zoneDistanceM != null ? `${Math.round(report.summary.zoneDistanceM)} m measured zone` : null,
      `Athlete profile ${report.summary.athleteProfileCompletenessPct}% complete`,
      report.version,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <AppShell userEmail={user.email ?? ""}>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3b8eff]">Sprint Intelligence</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#f5f7fb]">Why AVA reached these conclusions</h1>
          </div>
          <Link href={`/sessions/${id}`} className="shrink-0 text-sm font-medium text-[#b3bccb] transition hover:text-[#f5f7fb]">
            ← {sessionName}
          </Link>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-[#b3bccb]">
          Every finding is connected to measured data, comparison context, and confidence. AVA explains its
          reasoning — and what would change it — rather than only stating a result.
        </p>
        {report && <p className="mt-1 text-xs text-[#7e8797]">{metaLine}</p>}
      </div>

      {/* Executive explanation */}
      {report && (
        <section
          className={`mb-6 rounded-2xl border p-5 ${
            report.summary.hasPrimaryConclusion ? "border-[#2f80ed]/30 bg-[#2f80ed]/[0.06]" : "border-white/[0.08] bg-[#182233]"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3b8eff]">
            {report.summary.hasPrimaryConclusion ? "Primary finding" : "Summary"}
          </p>
          <p className="mt-1 text-base font-medium leading-relaxed text-[#f5f7fb]">{report.summary.headline}</p>
        </section>
      )}

      {report?.summary.hasPrimaryConclusion && (
        <div className="mb-6 flex justify-end">
          <Link
            href={`/sessions/${id}/coaching-recommendations`}
            className="rounded-lg bg-[#2f80ed] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#3b8eff]"
          >
            What should we work on next? →
          </Link>
        </div>
      )}

      {blocked ? (
        <Notice
          sessionId={id}
          title={
            report?.status === "calibration_missing"
              ? "Calibration required"
              : report?.status === "insufficient_data"
                ? "Insufficient valid steps"
                : report?.status === "processing"
                  ? "Analysis still processing"
                  : "Explanation unavailable"
          }
          body={report?.summary.headline ?? "Sprint Intelligence is not available for this analysis yet."}
        />
      ) : (
        report && (
          <div className="space-y-6">
            {/* Primary + supporting conclusions */}
            <div className="space-y-4">
              {report.primaryConclusion && <ConclusionCard conclusion={report.primaryConclusion} emphasis />}
              {report.supportingConclusions.map((c) => (
                <ConclusionCard key={c.id} conclusion={c} />
              ))}
            </div>

            {/* Strengths */}
            {report.strengths.length > 0 && (
              <div>
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#89d46a]">Performance strengths</h2>
                <div className="space-y-4">
                  {report.strengths.map((s) => (
                    <ConclusionCard key={s.id} conclusion={s} />
                  ))}
                </div>
              </div>
            )}

            {/* Report-level counter-evidence */}
            {report.counterEvidence.length > 0 && (
              <Section title="What reduces confidence overall">
                <ul className="space-y-1 text-sm text-[#b3bccb]">
                  {report.counterEvidence.map((e, i) => (
                    <li key={i}>− {e.value}</li>
                  ))}
                </ul>
              </Section>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {report.assumptions.length > 0 && (
                <Section title="Assumptions AVA relied on">
                  <ul className="space-y-1 text-sm text-[#b3bccb]">
                    {report.assumptions.map((a) => (
                      <li key={a.id}>• {a.text}</li>
                    ))}
                  </ul>
                </Section>
              )}

              {report.missingInputs.length > 0 && (
                <Section title="What would improve this analysis">
                  <ul className="space-y-2 text-sm text-[#b3bccb]">
                    {report.missingInputs.map((mi) => (
                      <li key={mi.id}>
                        <span className="font-semibold text-[#f5f7fb]">{mi.label}</span>
                        <span className="block text-xs text-[#7e8797]">{mi.wouldImprove}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>

            {report.changeConditions.length > 0 && (
              <Section title="What would change AVA's conclusion">
                <ul className="space-y-1 text-sm text-[#b3bccb]">
                  {report.changeConditions.map((c) => (
                    <li key={c.id}>• {c.text}</li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Methodology */}
            <Section title="Methodology">
              <div className="space-y-2 text-sm text-[#b3bccb]">
                <p>{report.methodology.rankingBasis}</p>
                <p>{report.methodology.confidenceBasis}</p>
                <p className="text-xs text-[#7e8797]">{report.methodology.targetBasisSummary}</p>
                <div className="grid gap-3 pt-2 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7e8797]">Metrics used</p>
                    <p className="mt-1 text-xs">{report.methodology.metricsUsed.join(" · ")}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7e8797]">Not yet available</p>
                    <ul className="mt-1 space-y-0.5 text-xs text-[#7e8797]">
                      {report.methodology.unavailableModels.map((m) => (
                        <li key={m}>• {m}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="pt-2 text-[11px] text-[#55617a]">Model version {report.methodology.version}</p>
              </div>
            </Section>
          </div>
        )
      )}
    </AppShell>
  );
}
