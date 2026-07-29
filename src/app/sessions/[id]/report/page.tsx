import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAnalysisReport } from "@/lib/analysisReport/loadContext";
import type { ReportAudience } from "@/lib/analysisReport";
import ReportDocument from "./ReportDocument";
import { PrintReportButton } from "./PrintReportButton";

export default async function SessionReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ audience?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const audience: ReportAudience =
    query.audience === "coach" ? "coach" : query.audience === "organization" ? "organization" : "athlete";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const loaded = await loadAnalysisReport(id, audience);
  if (!loaded.found) notFound();
  if (!loaded.report) {
    const content = loaded.state === "processing"
      ? ["Report is being prepared", "AVA will make the report available after the current analysis finishes."]
      : loaded.state === "failed"
        ? ["Report could not be generated", "Your analysis results remain available. Rerun the failed analysis or return to the session."]
        : ["Report evidence unavailable", "A completed analysis with authoritative metrics and intelligence output is required."];
    return <ReportState title={content[0]} detail={content[1]} back={`/sessions/${id}`} />;
  }

  return (
    <main className="analysis-report-shell mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      <nav className="report-no-print mb-6 flex flex-wrap items-center justify-between gap-3" aria-label="Report controls">
        <Link href={`/sessions/${id}`} className="text-sm text-[#b3bccb] hover:text-white">← {loaded.sessionName}</Link>
        <div className="flex flex-wrap items-center gap-2">
          {(["athlete", "coach", "organization"] as const).map((item) => (
            <Link
              key={item}
              aria-current={audience === item ? "page" : undefined}
              href={`/sessions/${id}/report?audience=${item}`}
              className={`rounded-full border px-4 py-2 text-sm capitalize ${
                audience === item ? "border-[#2f80ed] bg-[#2f80ed]/15 text-white" : "border-white/15 text-[#b3bccb]"
              }`}
            >
              {item} view
            </Link>
          ))}
          <PrintReportButton />
        </div>
      </nav>
      <ReportDocument report={loaded.report} />
    </main>
  );
}

function ReportState({ title, detail, back }: { title: string; detail: string; back: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
      <section className="rounded-2xl border border-white/10 bg-[#101827] p-7">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-[#b3bccb]">{detail}</p>
        <Link href={back} className="mt-6 inline-block text-[#3b8eff]">Return to session</Link>
      </section>
    </main>
  );
}
