import {
  digitalTwinSnapshotSchema, twinTimelineEventSchema,
  type DigitalTwinSnapshot, type TwinTimelineEvent,
} from "./contracts";

export function serializeTimelineEventForPersistence(raw: TwinTimelineEvent) {
  const event = twinTimelineEventSchema.parse(raw);
  return {
    p_athlete_id: event.athleteId,
    p_event: event,
  };
}

export function serializeTwinSnapshotForPersistence(raw: DigitalTwinSnapshot) {
  const snapshot = digitalTwinSnapshotSchema.parse(raw);
  return {
    p_athlete_id: snapshot.athleteId,
    p_snapshot: snapshot,
    p_reason: snapshot.reason,
  };
}
