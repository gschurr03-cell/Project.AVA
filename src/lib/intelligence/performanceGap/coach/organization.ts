/**
 * Organization / team structure helpers (Phase 11). Pure lookups over organizations, teams,
 * training groups, and athlete memberships — the backbone future organizations plug into.
 * Enforces organization isolation on every cross-entity query. Pure + deterministic.
 */

import type { AthleteMembership, Coach, Team, TrainingGroup } from "./models";

export const ORGANIZATION_VERSION = "ava-coach-organization-v1" as const;

/** Athletes whose primary coach is this coach (org-scoped). */
export function coachAthletes(memberships: AthleteMembership[], coachId: string, orgId: string): string[] {
  return memberships.filter((m) => m.orgId === orgId && m.primaryCoachId === coachId).map((m) => m.athleteId).sort();
}

/** All athlete ids in an organization. */
export function athletesInOrg(memberships: AthleteMembership[], orgId: string): string[] {
  return memberships.filter((m) => m.orgId === orgId).map((m) => m.athleteId).sort();
}

/** Athlete ids on a team (org-scoped, isolation-safe). */
export function teamAthletes(memberships: AthleteMembership[], team: Team): string[] {
  return memberships.filter((m) => m.orgId === team.orgId && m.teamId === team.id).map((m) => m.athleteId).sort();
}

export function groupAthletes(memberships: AthleteMembership[], group: TrainingGroup): string[] {
  return memberships.filter((m) => m.orgId === group.orgId && m.groupId === group.id).map((m) => m.athleteId).sort();
}

export function membershipFor(memberships: AthleteMembership[], athleteId: string, orgId: string): AthleteMembership | null {
  return memberships.find((m) => m.athleteId === athleteId && m.orgId === orgId) ?? null;
}

/** Coaches assigned to a team (org-scoped). */
export function teamCoaches(coaches: Coach[], team: Team): Coach[] {
  return coaches.filter((c) => c.orgId === team.orgId && (team.coachIds.includes(c.id) || c.role === "owner" || c.role === "head_coach")).sort((a, b) => a.id.localeCompare(b.id));
}

/** True only when every entity belongs to the same organization. */
export function sameOrganization(orgId: string, ...entities: { orgId: string }[]): boolean {
  return entities.every((e) => e.orgId === orgId);
}
