const RESTRICTED = [
  /\bscience proves?\b/i, /\bguaranteed\b/i, /\buniversally optimal\b/i,
  /\bprevents injury\b/i, /\bcauses injury\b/i, /\ball elite sprinters\b/i,
  /\bevery athlete should\b/i, /\bclinically validated\b/i,
];
export const unsafeResearchPhrases = (text: string) =>
  RESTRICTED.filter((pattern) => pattern.test(text)).map(String);
export function assertSafeResearchLanguage(text: string): void {
  const unsafe = unsafeResearchPhrases(text);
  if (unsafe.length) throw new Error(`Unsafe research language: ${unsafe.join(", ")}`);
}

