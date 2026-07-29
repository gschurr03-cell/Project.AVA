/**
 * Small deterministic statistics helpers shared by the Progress engines (Phase 10):
 * ordinary least-squares regression, R², median, and MAD. No dependencies. Pure.
 */

export interface Regression {
  slope: number;
  intercept: number;
  /** Coefficient of determination 0..1 (1 = perfect linear fit). */
  r2: number;
  /** Standard deviation of the residuals (in y units). */
  residualStd: number;
  n: number;
}

/** OLS fit of y on x. Returns null when there are fewer than two points. */
export function regression(xs: number[], ys: number[]): Regression | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    ssRes += (ys[i] - pred) ** 2;
  }
  const r2 = syy === 0 ? 1 : Math.max(0, 1 - ssRes / syy);
  const residualStd = Math.sqrt(ssRes / Math.max(1, n - 2));
  return { slope, intercept, r2, residualStd, n };
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median absolute deviation (robust spread), scaled to be σ-comparable. */
export function mad(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = median(xs);
  const dev = xs.map((x) => Math.abs(x - m));
  return 1.4826 * median(dev);
}

export function round(v: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
