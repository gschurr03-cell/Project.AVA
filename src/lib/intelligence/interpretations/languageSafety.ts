const RESTRICTED_ASSERTIONS = [
  /\bcaused by\b/i,
  /\bproves?\b/i,
  /\bdefinitely\b/i,
  /\binjury risk\b/i,
  /\bdysfunctional\b/i,
  /\boptimal\b/i,
  /\belite\b/i,
  /\bperfect\b/i,
  /\bdangerous\b/i,
  /\binefficient\b/i,
];

export function unsafeInterpretationPhrases(text: string): string[] {
  return RESTRICTED_ASSERTIONS.filter((pattern) => pattern.test(text)).map(
    (pattern) => pattern.source,
  );
}

export function assertSafeInterpretationLanguage(fields: {
  title: string;
  summary: string;
  explanation: string;
  likelyMeaning: string;
}): void {
  const text = Object.values(fields).join(" ");
  const unsafe = unsafeInterpretationPhrases(text);
  if (unsafe.length) {
    throw new Error(`Unsafe interpretation language: ${unsafe.join(", ")}`);
  }
}
