/**
 * Coach Override (Phase 12). AVA proposes; the coach disposes. Coaches can approve, modify,
 * replace, adjust priority, lock, or reject any premium recommendation — every action is
 * recorded to the shared audit trail (Phase 11). Locked recommendations are protected from
 * auto-adaptation. AVA can also LEARN organization wording preferences — which only reshapes
 * language, never the measured biomechanics. Pure + deterministic.
 */

import { makeAuditEntry } from "../coach/audit";
import type { AuditEntry, OrganizationRole } from "../coach/models";
import type { ResolvedPreferences } from "../coach/preferences";
import type { CoachOverrideState, PremiumRecommendation } from "./models";

export const PREMIUM_OVERRIDE_VERSION = "ava-premium-override-v1" as const;

export function pendingOverride(): CoachOverrideState {
  return { status: "pending", editedText: null, byCoachId: null, at: null, reasoning: null, locked: false };
}

export type OverrideActionType = "approve" | "modify" | "replace" | "adjust_priority" | "lock" | "reject";

export interface OverrideAction {
  type: OverrideActionType;
  coachId: string;
  coachRole: OrganizationRole;
  orgId: string;
  at: string;
  editedText?: string | null;
  reasoning?: string | null;
  newPriority?: number | null;
}

export interface OverrideResult {
  recommendation: PremiumRecommendation;
  audit: AuditEntry;
  errors: string[];
}

const NEEDS_TEXT: OverrideActionType[] = ["modify", "replace"];

export function applyOverride(rec: PremiumRecommendation, action: OverrideAction): OverrideResult {
  const errors: string[] = [];
  if (NEEDS_TEXT.includes(action.type) && !nonEmpty(action.editedText)) {
    errors.push(`action "${action.type}" requires editedText`);
    return { recommendation: rec, audit: auditFor(rec, action, rec.what), errors };
  }

  const status: CoachOverrideState["status"] =
    action.type === "approve" ? "approved" :
    action.type === "modify" ? "modified" :
    action.type === "replace" ? "replaced" :
    action.type === "reject" ? "rejected" :
    action.type === "lock" ? "locked" :
    rec.coachOverride.status; // adjust_priority keeps status

  const coachOverride: CoachOverrideState = {
    status,
    editedText: NEEDS_TEXT.includes(action.type) ? (action.editedText ?? null) : rec.coachOverride.editedText,
    byCoachId: action.coachId,
    at: action.at,
    reasoning: action.reasoning ?? rec.coachOverride.reasoning,
    locked: action.type === "lock" ? true : rec.coachOverride.locked,
  };

  const recommendation: PremiumRecommendation = {
    ...rec,
    coachOverride,
    priority: action.type === "adjust_priority" && action.newPriority != null ? action.newPriority : rec.priority,
  };

  return { recommendation, audit: auditFor(rec, action, coachOverride.editedText ?? rec.what), errors: [] };
}

/** The text the athlete ultimately sees, honouring the coach's decision. */
export function resolveRecommendation(rec: PremiumRecommendation): { shown: boolean; text: string; source: "ai" | "coach" } {
  const o = rec.coachOverride;
  if (o.status === "rejected") return { shown: false, text: "", source: "coach" };
  if ((o.status === "modified" || o.status === "replaced") && o.editedText) return { shown: true, text: o.editedText, source: "coach" };
  return { shown: true, text: rec.what, source: "ai" };
}

/**
 * Learn an organization wording preference — merges new terminology / emphasis into the
 * resolved preferences. This changes LANGUAGE and ORDERING only; it can never alter a
 * measured biomechanic value.
 */
export function learnOrgPreference(current: ResolvedPreferences, learned: { terminology?: Record<string, string>; emphasis?: Record<string, number> }): ResolvedPreferences {
  return {
    ...current,
    terminology: { ...current.terminology, ...(learned.terminology ?? {}) },
    emphasis: { ...current.emphasis, ...(learned.emphasis ?? {}) },
  };
}

function auditFor(rec: PremiumRecommendation, action: OverrideAction, after: string): AuditEntry {
  return makeAuditEntry({
    id: `audit-override-${rec.id}-${action.type}`,
    orgId: action.orgId,
    actorId: action.coachId,
    actorRole: action.coachRole,
    action: "coach_edit",
    targetType: "premium_recommendation",
    targetId: rec.id,
    at: action.at,
    before: rec.what,
    after,
    reason: action.reasoning ?? action.type,
  });
}

function nonEmpty(s: string | null | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}
