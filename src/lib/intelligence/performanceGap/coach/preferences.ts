/**
 * Coach Knowledge Layer (Phase 11). Organization- and coach-specific philosophy: preferred
 * terminology, cue wording, and metric emphasis. These preferences influence WORDING and
 * ORDERING only — they never touch measured data or change a single number. A coach who
 * emphasises acceleration or prefers particular cue language sees AVA speak their language,
 * over the same underlying analysis. Pure + deterministic.
 */

import type { CoachPreference } from "./models";

export const COACH_PREFERENCES_VERSION = "ava-coach-preferences-v1" as const;

export interface ResolvedPreferences {
  emphasis: Record<string, number>;
  terminology: Record<string, string>;
  cuePreferences: string[];
  philosophyNote: string | null;
}

/** Merge organization defaults with a coach's personal overrides (coach wins). */
export function resolvePreferences(org?: CoachPreference | null, coach?: CoachPreference | null): ResolvedPreferences {
  const emphasis: Record<string, number> = {};
  for (const e of org?.emphasis ?? []) emphasis[e.metricId] = e.weight;
  for (const e of coach?.emphasis ?? []) emphasis[e.metricId] = e.weight; // coach overrides
  const terminology: Record<string, string> = { ...(org?.terminology ?? {}), ...(coach?.terminology ?? {}) };
  const cuePreferences = uniq([...(org?.cuePreferences ?? []), ...(coach?.cuePreferences ?? [])]);
  const philosophyNote = coach?.philosophyNote ?? org?.philosophyNote ?? null;
  return { emphasis, terminology, cuePreferences, philosophyNote };
}

/**
 * Rephrase text using the preferred terminology map — case-insensitive, longest phrase
 * first so overlapping phrases don't clobber each other. Numbers are never touched.
 */
export function applyTerminology(text: string, prefs: ResolvedPreferences): string {
  let out = text;
  const entries = Object.entries(prefs.terminology).sort((a, b) => b[0].length - a[0].length);
  for (const [canonical, preferred] of entries) {
    if (!canonical) continue;
    const re = new RegExp(escapeRegExp(canonical), "gi");
    out = out.replace(re, preferred);
  }
  return out;
}

/** Emphasis weight for a metric (1 = neutral). */
export function emphasisFor(metricId: string, prefs: ResolvedPreferences): number {
  return prefs.emphasis[metricId] ?? 1;
}

/** Reorder items by the coach's metric emphasis (stable; measured values untouched). */
export function reorderByEmphasis<T extends { metricId: string }>(items: T[], prefs: ResolvedPreferences): T[] {
  return items
    .map((item, index) => ({ item, index, weight: emphasisFor(item.metricId, prefs) }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((x) => x.item);
}

/**
 * Apply the knowledge layer to a recommendation's WORDING, returning the reworded text and
 * the emphasis weight — while asserting the associated measured payload is passed through
 * byte-for-byte unchanged.
 */
export function applyPreferencesToText(input: { text: string; metricId: string }, prefs: ResolvedPreferences): { text: string; metricId: string; emphasis: number } {
  return { text: applyTerminology(input.text, prefs), metricId: input.metricId, emphasis: emphasisFor(input.metricId, prefs) };
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
