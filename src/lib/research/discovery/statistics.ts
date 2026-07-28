export const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

export function pearson(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const am = mean(a);
  const bm = mean(b);
  const numerator = a.reduce((sum, value, index) => sum + (value - am) * (b[index] - bm), 0);
  const denominator = Math.sqrt(
    a.reduce((sum, value) => sum + (value - am) ** 2, 0) *
    b.reduce((sum, value) => sum + (value - bm) ** 2, 0),
  );
  return denominator === 0 ? null : numerator / denominator;
}

export const round = (value: number, places = 4) => Number(value.toFixed(places));

export function stableHash(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
