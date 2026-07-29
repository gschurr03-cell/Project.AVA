export const REPORT_LOCALE = "en-US";
export const REPORT_PAGE_SIZE = "Letter";

export function formatReportNumber(value: number | null, unit: string, precision = 3): string {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return `${new Intl.NumberFormat(REPORT_LOCALE, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value)} ${unit}`;
}

export function formatReportDate(value: string | null): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat(REPORT_LOCALE, {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  }).format(date);
}

export function formatPercent(value: number | null, precision = 0): string {
  return value == null ? "Unavailable" : `${(value * 100).toFixed(precision)}%`;
}
