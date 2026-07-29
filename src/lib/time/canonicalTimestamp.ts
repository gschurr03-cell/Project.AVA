/**
 * Canonical timestamp normalization for the trust boundary between stored data
 * (PostgreSQL `timestamptz`, returned by PostgREST as ISO-8601 *with a timezone
 * offset*, e.g. `2026-07-21T03:43:45.584065+00:00`) and the engine contracts,
 * which validate `generatedAt` with Zod `z.string().datetime()` — a validator
 * that by default accepts ONLY canonical UTC `Z` form (no offset, no space).
 *
 * `toCanonicalIso` converts any safely-parseable timestamp (offset ISO, the
 * space-separated Postgres text form, a `Date`, or already-canonical `Z`) into
 * canonical ISO-8601 UTC. It returns `null` — never throws, never invents a
 * time — for values that are absent (null/undefined/empty) or genuinely
 * unparseable ("Invalid Date"), so callers can model absence explicitly instead
 * of crashing a route. This is deliberately NOT a blind `new Date(v).toISOString()`:
 * that throws a RangeError on invalid input.
 */
export function toCanonicalIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  // Guard before toISOString: an "Invalid Date" has a NaN time and would throw.
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
