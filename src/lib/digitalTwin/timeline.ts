import { twinTimelineEventSchema, type TwinTimelineEvent } from "./contracts";

export function accumulateTimeline(events: TwinTimelineEvent[]): {
  timeline: TwinTimelineEvent[]; duplicateCount: number;
} {
  const byId = new Map<string, TwinTimelineEvent>();
  let duplicateCount = 0;
  for (const raw of events) {
    const event = twinTimelineEventSchema.parse(raw);
    const existing = byId.get(event.eventId);
    if (!existing) byId.set(event.eventId, event);
    else if (JSON.stringify(existing) === JSON.stringify(event)) duplicateCount += 1;
    else throw new Error(`Historical event identity collision: ${event.eventId}`);
  }
  return {
    timeline: [...byId.values()].sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId)),
    duplicateCount,
  };
}

