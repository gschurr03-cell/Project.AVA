/**
 * Phase R4C — deterministic ground-truth ↔ AVA contact matching (Part I/J).
 *
 * The matching rule is fixed BEFORE any error is computed and never looks at
 * spatial distance to decide whether two contacts correspond — only
 * timestamp proximity, declared foot side, and contact order. Matching on
 * "whichever AVA contact minimizes position error" would let a model win by
 * picking its most favorable pairing instead of being graded on a pairing
 * decided independently of its own output; this file exists specifically to
 * prevent that.
 */

export type ContactSide = "left" | "right" | "unknown";

export interface GroundTruthContactInput {
  contactNumber: number;
  side: ContactSide | null;
  timestampS: number | null;
}

export interface AvaContactInput {
  contactId: string;
  side: "left" | "right";
  timeS: number;
}

export type MatchClassification = "MATCHED" | "AVA_FALSE_POSITIVE" | "AVA_FALSE_NEGATIVE" | "AMBIGUOUS";

export interface ContactMatch {
  classification: MatchClassification;
  gtContactNumber: number | null;
  avaContactId: string | null;
  /** Present only for MATCHED/AMBIGUOUS pairs where both sides had a timestamp. */
  timeDeltaS: number | null;
  reason: string;
}

/**
 * Default match window: sprinters rarely exceed ~5 Hz combined (alternating
 * left/right) cadence, i.e. ~200ms between successive contacts of any foot.
 * 60ms is comfortably under half that spacing so the window cannot itself
 * straddle two real, distinct contacts. This is a fixed methodological
 * constant, not fit to any benchmark's data (no ground-truth timestamps
 * exist yet to fit it to).
 */
export const DEFAULT_MATCH_WINDOW_S = 0.06;

function sideCompatible(gtSide: ContactSide | null, avaSide: "left" | "right"): boolean {
  return gtSide == null || gtSide === "unknown" || gtSide === avaSide;
}

/**
 * Deterministically matches ground-truth contacts to AVA contacts.
 *
 * - If EVERY ground-truth contact and every AVA contact carries a timestamp,
 *   matching walks both lists in time order within `matchWindowS`.
 * - Otherwise (any timestamp missing), matching falls back to strict
 *   contact-order alignment (GT contact N ↔ the Nth AVA contact), which is
 *   the only order-independent-of-error rule available without timestamps.
 * - A side conflict (both declared, and different) inside an otherwise
 *   eligible pairing is never silently resolved — it is reported as
 *   AMBIGUOUS rather than matched or dropped.
 */
export function matchContacts(
  gtContacts: GroundTruthContactInput[],
  avaContacts: AvaContactInput[],
  options?: { matchWindowS?: number },
): ContactMatch[] {
  const matchWindowS = options?.matchWindowS ?? DEFAULT_MATCH_WINDOW_S;
  const gt = [...gtContacts].sort((a, b) => a.contactNumber - b.contactNumber);
  const ava = [...avaContacts].sort((a, b) => a.timeS - b.timeS);
  const allTimestamped = gt.every((g) => g.timestampS != null) && ava.every((a) => a.timeS != null);

  const results: ContactMatch[] = [];

  if (!allTimestamped) {
    // Order-only fallback — strictly index-aligned, no distance/error involved.
    const n = Math.max(gt.length, ava.length);
    for (let i = 0; i < n; i++) {
      const g = gt[i] ?? null;
      const a = ava[i] ?? null;
      if (g && a) {
        if (sideCompatible(g.side, a.side)) {
          results.push({ classification: "MATCHED", gtContactNumber: g.contactNumber, avaContactId: a.contactId, timeDeltaS: g.timestampS != null && a.timeS != null ? a.timeS - g.timestampS : null, reason: "order-aligned (timestamps unavailable on at least one side)" });
        } else {
          results.push({ classification: "AMBIGUOUS", gtContactNumber: g.contactNumber, avaContactId: a.contactId, timeDeltaS: null, reason: `order-aligned but declared side conflicts (gt=${g.side}, ava=${a.side})` });
        }
      } else if (g && !a) {
        results.push({ classification: "AVA_FALSE_NEGATIVE", gtContactNumber: g.contactNumber, avaContactId: null, timeDeltaS: null, reason: "no corresponding AVA contact at this order position" });
      } else if (a && !g) {
        results.push({ classification: "AVA_FALSE_POSITIVE", gtContactNumber: null, avaContactId: a.contactId, timeDeltaS: null, reason: "no corresponding ground-truth contact at this order position" });
      }
    }
    return results;
  }

  // Timestamp-window two-pointer walk.
  let gi = 0;
  let ai = 0;
  while (gi < gt.length && ai < ava.length) {
    const g = gt[gi];
    const a = ava[ai];
    const dt = a.timeS - (g.timestampS as number);
    if (Math.abs(dt) <= matchWindowS) {
      if (sideCompatible(g.side, a.side)) {
        results.push({ classification: "MATCHED", gtContactNumber: g.contactNumber, avaContactId: a.contactId, timeDeltaS: dt, reason: `within ${matchWindowS * 1000}ms window` });
      } else {
        results.push({ classification: "AMBIGUOUS", gtContactNumber: g.contactNumber, avaContactId: a.contactId, timeDeltaS: dt, reason: `within time window but declared side conflicts (gt=${g.side}, ava=${a.side})` });
      }
      gi++;
      ai++;
    } else if (dt > matchWindowS) {
      // This AVA contact comes AFTER the current GT contact's window has already closed — the GT contact was missed.
      results.push({ classification: "AVA_FALSE_NEGATIVE", gtContactNumber: g.contactNumber, avaContactId: null, timeDeltaS: null, reason: `no AVA contact within ${matchWindowS * 1000}ms` });
      gi++;
    } else {
      // dt < -matchWindowS: this AVA contact comes BEFORE the current GT contact's window — it has no GT counterpart.
      results.push({ classification: "AVA_FALSE_POSITIVE", gtContactNumber: null, avaContactId: a.contactId, timeDeltaS: null, reason: `no GT contact within ${matchWindowS * 1000}ms` });
      ai++;
    }
  }
  while (gi < gt.length) {
    results.push({ classification: "AVA_FALSE_NEGATIVE", gtContactNumber: gt[gi].contactNumber, avaContactId: null, timeDeltaS: null, reason: "trailing ground-truth contact with no remaining AVA contacts" });
    gi++;
  }
  while (ai < ava.length) {
    results.push({ classification: "AVA_FALSE_POSITIVE", gtContactNumber: null, avaContactId: ava[ai].contactId, timeDeltaS: null, reason: "trailing AVA contact with no remaining ground-truth contacts" });
    ai++;
  }
  return results;
}

export interface ContactDetectionStats {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  ambiguous: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

/** Precision/recall/F1 on contact DETECTION only — scientifically separate from distance accuracy (Part J). */
export function contactDetectionStats(matches: ContactMatch[]): ContactDetectionStats {
  const truePositives = matches.filter((m) => m.classification === "MATCHED").length;
  const falsePositives = matches.filter((m) => m.classification === "AVA_FALSE_POSITIVE").length;
  const falseNegatives = matches.filter((m) => m.classification === "AVA_FALSE_NEGATIVE").length;
  const ambiguous = matches.filter((m) => m.classification === "AMBIGUOUS").length;
  const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : null;
  const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : null;
  const f1 = precision != null && recall != null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
  return { truePositives, falsePositives, falseNegatives, ambiguous, precision, recall, f1 };
}
