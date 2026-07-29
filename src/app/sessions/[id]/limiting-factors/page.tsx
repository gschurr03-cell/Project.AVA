import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/nav/AppShell";
import { loadLimitingFactors } from "@/lib/limitingFactors/loadContext";
import { CONFIDENCE_LABEL_TEXT } from "@/lib/limitingFactors";
import LimiterCard from "./LimiterCard";

function Notice({ title, body, sessionId }: { title: string; body: string; sessionId: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#182233] p-8 text-center shadow-[0_8px_30px_rgba(0,0,0,0.24)]">
      <p className="text-lg font-semibold text-[#f5f7fb]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[#b3bccb]">{body}</p>
      <Link href={`/sessions/${sessionId}`} className="mt-5 inline-block rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#b3bccb] transition hover:bg-white/[0.08]">
        Back to analysis
      </Link>
    </div>
  );
}

export default async function LimitingFactorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { result, sessionName, found } = await loadLimitingFactors(id);
  if (!found) notFound();

  const zoneCtx = result?.zoneDistanceM != null ? `${Math.round(result.zoneDistanceM)} m measured zone` : null;
  const dateCtx = result?.sessionDate ? new Date(result.sessionDate).toLocaleDateString() : null;

  return (
    <AppShell userEmail={user.email ?? ""}>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3b8eff]">Sprint Intelligence</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#f5f7fb]">Limiting Factors</h1>
          </div>
          <Link href={`/sessions/${id}`} className="shrink-0 text-sm font-medium text-[#b3bccb] transition hover:text-[#f5f7fb]">← {sessionName}</Link>
        </div>
        <p className="mt-2 text-sm text-[#b3bccb]">
          AVA identified the factors most likely constraining this performance. Findings are ranked by estimated impact and confidence.
        </p>
        <p className="mt-1 text-xs text-[#7e8797]">
          {[
            result ? `${result.meaningfulCount} meaningful ${result.meaningfulCount === 1 ? "finding" : "findings"}` : null,
            result ? `Data quality: ${CONFIDENCE_LABEL_TEXT[result.overallDataQuality]}` : null,
            zoneCtx,
            dateCtx,
          ].filter(Boolean).join(" · ")}
        </p>
      </div>

      {!result || result.status === "calibration_missing" ? (
        <Notice sessionId={id} title="Calibration required" body="Timing metrics — and the limiting-factor analysis that depends on them — are unavailable until a zone is confirmed in the Timing Workspace." />
      ) : result.status === "insufficient_data" ? (
        <Notice sessionId={id} title="Insufficient valid steps" body="This session did not produce enough valid in-zone steps with trustworthy spatial calibration to rank limiting factors reliably." />
      ) : result.limiters.length === 0 ? (
        <Notice sessionId={id} title="No reliable limiter identified" body="AVA did not find a meaningful, confidently-supported limiting factor in this session. Left and right measurements appeared balanced within measurement tolerance." />
      ) : (
        <div className="space-y-4">
          {result.primaryConstraint && (
            <section className="rounded-2xl border border-[#2f80ed]/30 bg-[#2f80ed]/[0.06] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3b8eff]">Primary performance constraint</p>
              <p className="mt-1 text-base font-medium text-[#f5f7fb]">{result.primaryConstraint}</p>
            </section>
          )}
          {result.limiters.map((l) => (
            <LimiterCard key={l.id} limiter={l} />
          ))}
          <div className="flex justify-end">
            <Link
              href={`/sessions/${id}/coaching-recommendations`}
              className="rounded-lg bg-[#2f80ed] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#3b8eff]"
            >
              View coaching recommendations →
            </Link>
          </div>
        </div>
      )}

      {result && result.unavailableModels.length > 0 && (
        <section className="mt-6 rounded-2xl border border-white/[0.06] bg-[#101827] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Not yet available</p>
          <p className="mt-1 text-sm text-[#b3bccb]">
            AVA does not yet have validated individualized models for the comparisons below, so it does not show a target range for them rather than invent one:
          </p>
          <ul className="mt-2 space-y-1 text-xs text-[#7e8797]">
            {result.unavailableModels.map((m) => (
              <li key={m}>• {m}</li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
