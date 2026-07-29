/**
 * Role-Based Access Control + organization isolation (Phase 11). A pure authorization
 * layer: which role may perform which action, and the hard rule that no actor may ever
 * reach a resource in a different organization. Every check returns a reason, so denials
 * are explainable. This is the gate the rest of the platform authorizes through. Pure.
 */

import { ROLE_PERMISSIONS, type PlatformAction } from "./config";
import type { OrganizationRole } from "./models";

export const RBAC_VERSION = "ava-coach-rbac-v1" as const;

export interface Actor {
  id: string;
  orgId: string;
  role: OrganizationRole;
  /** Teams the actor is scoped to (coaches). Empty = org-wide (owner / head coach). */
  teamIds?: string[];
  /** For athlete actors: their own athleteId (may only reach their own data). */
  athleteId?: string;
}

export interface AuthResult {
  allowed: boolean;
  reason: string;
}

/** Does this role hold this permission at all? */
export function can(role: OrganizationRole, action: PlatformAction): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(action);
}

/** Same-organization check — the backbone of tenant isolation. */
export function sameOrg(actor: Actor, resource: { orgId: string }): boolean {
  return actor.orgId === resource.orgId;
}

/**
 * Full authorization: the action must be permitted for the role, the resource must be in
 * the actor's organization, and athletes are additionally confined to their own athleteId.
 */
export function authorize(
  actor: Actor,
  action: PlatformAction,
  resource: { orgId: string; athleteId?: string; teamId?: string | null },
): AuthResult {
  if (!sameOrg(actor, resource)) {
    return { allowed: false, reason: `organization isolation: actor org ${actor.orgId} ≠ resource org ${resource.orgId}` };
  }
  if (!can(actor.role, action)) {
    return { allowed: false, reason: `role ${actor.role} does not hold permission ${action}` };
  }
  // Athletes may only act on their own data.
  if (actor.role === "athlete" && resource.athleteId != null && actor.athleteId !== resource.athleteId) {
    return { allowed: false, reason: `athlete may only access their own data` };
  }
  // Assistant coaches are scoped to their assigned teams (when the resource names a team).
  if (
    actor.role === "assistant_coach" &&
    resource.teamId != null &&
    actor.teamIds != null &&
    actor.teamIds.length > 0 &&
    !actor.teamIds.includes(resource.teamId)
  ) {
    return { allowed: false, reason: `assistant coach is not assigned to team ${resource.teamId}` };
  }
  return { allowed: true, reason: `permitted: ${actor.role} may ${action}` };
}

/** Convenience boolean form. */
export function isAuthorized(actor: Actor, action: PlatformAction, resource: { orgId: string; athleteId?: string; teamId?: string | null }): boolean {
  return authorize(actor, action, resource).allowed;
}
