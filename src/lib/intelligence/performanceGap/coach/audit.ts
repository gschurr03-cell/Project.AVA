/**
 * Audit History (Phase 11). An append-only, serializable log that makes every AI
 * recommendation and every human change traceable — who did what, when, from what to what,
 * and why. Pure + immutable (each append returns a new log). Organization-scoped queries.
 */

import type { AuditAction, AuditEntry, AuditLog, OrganizationRole } from "./models";

export const AUDIT_VERSION = "ava-coach-audit-v1" as const;

export function createAuditLog(): AuditLog {
  return { version: AUDIT_VERSION, entries: [] };
}

export interface AuditEntryInput {
  id: string;
  orgId: string;
  actorId: string;
  actorRole: OrganizationRole;
  action: AuditAction;
  targetType: string;
  targetId: string;
  at: string;
  before?: string | null;
  after?: string | null;
  reason?: string | null;
}

export function makeAuditEntry(input: AuditEntryInput): AuditEntry {
  return {
    id: input.id,
    orgId: input.orgId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    at: input.at,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? null,
  };
}

/** Append an entry, returning a NEW log (immutable). */
export function appendAudit(log: AuditLog, entry: AuditEntry): AuditLog {
  return { ...log, entries: [...log.entries, entry] };
}

export interface AuditQuery {
  orgId?: string;
  actorId?: string;
  action?: AuditAction;
  targetType?: string;
  targetId?: string;
}

/** Query the log (chronological), always confined to a single org when orgId is given. */
export function queryAudit(log: AuditLog, filter: AuditQuery = {}): AuditEntry[] {
  return log.entries
    .filter((e) =>
      (filter.orgId == null || e.orgId === filter.orgId) &&
      (filter.actorId == null || e.actorId === filter.actorId) &&
      (filter.action == null || e.action === filter.action) &&
      (filter.targetType == null || e.targetType === filter.targetType) &&
      (filter.targetId == null || e.targetId === filter.targetId),
    )
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

/** Full traceability trail for one target (e.g. one recommendation). */
export function traceTarget(log: AuditLog, targetType: string, targetId: string): AuditEntry[] {
  return queryAudit(log, { targetType, targetId });
}
