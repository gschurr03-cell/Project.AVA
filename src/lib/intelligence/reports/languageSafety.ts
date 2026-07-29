const RESTRICTED = [
  /\bcaused by\b/i, /\bproves?\b/i, /\bdefinitely\b/i, /\binjury risk\b/i,
  /\bdysfunctional\b/i, /\bperfect\b/i, /\bdangerous\b/i,
];

export function assertSafeReportLanguage(report: unknown): void {
  const text = JSON.stringify(report);
  const unsafe = RESTRICTED.filter((pattern) => pattern.test(text));
  if (unsafe.length) throw new Error(`Unsafe report language: ${unsafe.map(String).join(", ")}`);
}

