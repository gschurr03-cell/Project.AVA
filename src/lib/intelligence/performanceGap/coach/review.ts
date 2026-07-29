/**
 * Coach Review System (Phase 11). AVA assists — it never replaces the coach. Every AI
 * recommendation can be accepted, rejected, modified, annotated, or overridden, with the
 * coach's reasoning stored and the change recorded to the audit trail. The AI's original
 * text is preserved immutably; the coach's edit is what the athlete ultimately sees. Pure.
 */

import { authorize, type Actor, type AuthResult } from "./rbac";
import { makeAuditEntry } from "./audit";
import type { AuditEntry, CoachReview, ReviewDecision } from "./models";

export const COACH_REVIEW_VERSION = "ava-coach-review-v1" as const;

export interface ReviewInput {
  id: string;
  actor: Actor;
  recommendationId: string;
  athleteId: string;
  originalText: string;
  decision: ReviewDecision;
  editedText?: string | null;
  annotation?: string | null;
  reasoning?: string | null;
  at: string;
  previousReviewId?: string | null;
}

export interface ReviewResult {
  authorization: AuthResult;
  review: CoachReview | null;
  audit: AuditEntry | null;
  /** Validation errors (e.g. modify without edited text). */
  errors: string[];
}

const DECISIONS_NEEDING_EDIT: ReviewDecision[] = ["modified", "overridden"];

export function reviewRecommendation(input: ReviewInput): ReviewResult {
  const authorization = authorize(input.actor, "review_recommendations", { orgId: input.actor.orgId, athleteId: input.athleteId });
  if (!authorization.allowed) {
    return { authorization, review: null, audit: null, errors: [authorization.reason] };
  }

  const errors: string[] = [];
  if (DECISIONS_NEEDING_EDIT.includes(input.decision) && !nonEmpty(input.editedText)) {
    errors.push(`decision "${input.decision}" requires editedText`);
  }
  if (input.decision === "annotated" && !nonEmpty(input.annotation)) {
    errors.push(`decision "annotated" requires an annotation`);
  }
  if (errors.length > 0) {
    return { authorization, review: null, audit: null, errors };
  }

  const review: CoachReview = {
    id: input.id,
    recommendationId: input.recommendationId,
    athleteId: input.athleteId,
    orgId: input.actor.orgId,
    coachId: input.actor.id,
    decision: input.decision,
    originalText: input.originalText,
    editedText: DECISIONS_NEEDING_EDIT.includes(input.decision) ? (input.editedText ?? null) : null,
    annotation: input.annotation ?? null,
    reasoning: input.reasoning ?? null,
    createdAt: input.at,
    previousReviewId: input.previousReviewId ?? null,
  };

  const audit = makeAuditEntry({
    id: `audit-${input.id}`,
    orgId: input.actor.orgId,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: "review_decision",
    targetType: "recommendation",
    targetId: input.recommendationId,
    at: input.at,
    before: input.originalText,
    after: review.editedText ?? input.originalText,
    reason: input.reasoning ?? input.annotation ?? null,
  });

  return { authorization, review, audit, errors: [] };
}

/** The text the athlete ultimately sees, honouring the coach's decision. */
export function resolveRecommendationText(review: CoachReview): { shown: boolean; text: string; source: "ai" | "coach" | "hidden" } {
  switch (review.decision) {
    case "rejected":
      return { shown: false, text: "", source: "hidden" };
    case "modified":
    case "overridden":
      return { shown: true, text: review.editedText ?? review.originalText, source: "coach" };
    case "accepted":
    case "annotated":
    case "pending":
    default:
      return { shown: true, text: review.originalText, source: "ai" };
  }
}

function nonEmpty(s: string | null | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}
