/**
 * Collaboration (Phase 11). Coach and athlete notes, pinned observations, read/unread state,
 * threads for shared discussions, and internal comments — the substrate a future messaging
 * integration will build on. Pure, immutable operations over a note collection. No external
 * messaging is implemented here.
 */

import type { CoachNote } from "./models";

export const COLLABORATION_VERSION = "ava-coach-collaboration-v1" as const;

export interface NoteInput {
  id: string;
  orgId: string;
  athleteId: string;
  authorId: string;
  authorRole: "coach" | "athlete";
  text: string;
  createdAt: string;
  pinned?: boolean;
  threadId?: string | null;
}

export function createNote(input: NoteInput): CoachNote {
  return {
    id: input.id,
    orgId: input.orgId,
    athleteId: input.athleteId,
    authorId: input.authorId,
    authorRole: input.authorRole,
    text: input.text,
    pinned: input.pinned ?? false,
    createdAt: input.createdAt,
    read: false,
    threadId: input.threadId ?? null,
  };
}

export function addNote(notes: CoachNote[], note: CoachNote): CoachNote[] {
  return [...notes, note];
}

export function togglePin(notes: CoachNote[], id: string, pinned: boolean): CoachNote[] {
  return notes.map((n) => (n.id === id ? { ...n, pinned } : n));
}

export function markRead(notes: CoachNote[], id: string, read = true): CoachNote[] {
  return notes.map((n) => (n.id === id ? { ...n, read } : n));
}

export function deleteNote(notes: CoachNote[], id: string): CoachNote[] {
  return notes.filter((n) => n.id !== id);
}

/** Notes for one athlete, pinned first then newest first. */
export function notesForAthlete(notes: CoachNote[], athleteId: string): CoachNote[] {
  return notes
    .filter((n) => n.athleteId === athleteId)
    .slice()
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

/** A shared-discussion thread, chronological. */
export function thread(notes: CoachNote[], threadId: string): CoachNote[] {
  return notes.filter((n) => n.threadId === threadId).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function unreadCount(notes: CoachNote[]): number {
  return notes.filter((n) => !n.read).length;
}
