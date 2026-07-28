"use client";

export function PrintReportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="report-no-print rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-[#2f80ed] focus:outline-none focus:ring-2 focus:ring-[#2f80ed]"
      aria-label="Print or save report as PDF"
    >
      Print / Save PDF
    </button>
  );
}

