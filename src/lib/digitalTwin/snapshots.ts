import {
  DIGITAL_TWIN_SNAPSHOT_VERSION, digitalTwinSnapshotSchema,
  type AthleteDigitalTwin, type DigitalTwinSnapshot,
} from "./contracts";
import { DIGITAL_TWIN_POLICY } from "./policy";

export function createDigitalTwinSnapshot(input: {
  snapshotId: string; twin: AthleteDigitalTwin; previousSnapshotId: string | null;
  reason: string; createdAt: string;
}): DigitalTwinSnapshot {
  return digitalTwinSnapshotSchema.parse({
    ...input, athleteId: input.twin.athleteId,
    snapshotVersion: DIGITAL_TWIN_SNAPSHOT_VERSION,
  });
}

export function compareDigitalTwinSnapshots(
  previous: DigitalTwinSnapshot, current: DigitalTwinSnapshot,
) {
  if (previous.athleteId !== current.athleteId) throw new Error("Cannot compare twins from different athletes.");
  const priorEvents = new Set(previous.twin.timeline.map((event) => event.eventId));
  return {
    athleteId: current.athleteId,
    addedEventIds: current.twin.timeline.filter((event) => !priorEvents.has(event.eventId)).map((event) => event.eventId),
    confidenceChange: current.twin.confidenceScore.score - previous.twin.confidenceScore.score,
    baselineChanges: current.twin.mechanicalBaselines.map((baseline) => {
      const prior = previous.twin.mechanicalBaselines.find((item) =>
        item.metric === baseline.metric && item.compatibilityKey === baseline.compatibilityKey);
      return { metric: baseline.metric, previous: prior?.mean ?? null, current: baseline.mean };
    }),
    archetypeChanges: current.twin.movementArchetype.map((item) => item.archetype)
      .filter((item) => !previous.twin.movementArchetype.some((prior) => prior.archetype === item)),
  };
}

export function selectRollbackSnapshot(
  snapshots: DigitalTwinSnapshot[], targetSnapshotId: string, athleteId: string,
): DigitalTwinSnapshot {
  const target = snapshots.find((snapshot) =>
    snapshot.snapshotId === targetSnapshotId && snapshot.athleteId === athleteId);
  if (!target) throw new Error("Rollback target does not exist for this athlete.");
  return target;
}

export function assessDigitalTwinSnapshotUpdate(
  previous: DigitalTwinSnapshot | null, current: AthleteDigitalTwin,
): { majorUpdate: boolean; reasons: string[]; addedEventIds: string[] } {
  if (!previous) return {
    majorUpdate: true, reasons: ["Initial Digital Twin snapshot."],
    addedEventIds: current.timeline.map((event) => event.eventId),
  };
  if (previous.athleteId !== current.athleteId) throw new Error("Snapshot update athlete mismatch.");
  const priorIds = new Set(previous.twin.timeline.map((event) => event.eventId));
  const added = current.timeline.filter((event) => !priorIds.has(event.eventId));
  const reasons: string[] = [];
  if (added.length >= DIGITAL_TWIN_POLICY.majorUpdateEventThreshold)
    reasons.push(`${added.length} new immutable events accumulated.`);
  if (added.some((event) => event.payload.kind === "season"))
    reasons.push("Season history changed.");
  if (added.some((event) => event.payload.kind === "reported_health_context"))
    reasons.push("Reported health context changed.");
  if (added.some((event) => event.payload.kind === "performance_result" &&
    event.payload.resultType === "personal_best"))
    reasons.push("A verified personal-best event was added.");
  const previousKeys = new Set(previous.twin.mechanicalBaselines.map((item) => `${item.metric}:${item.compatibilityKey}`));
  if (current.mechanicalBaselines.some((item) => !previousKeys.has(`${item.metric}:${item.compatibilityKey}`)))
    reasons.push("A compatible mechanical baseline was added or changed protocol.");
  const previousArchetypes = new Set(previous.twin.movementArchetype.map((item) => item.archetype));
  if (current.movementArchetype.some((item) => !previousArchetypes.has(item.archetype)))
    reasons.push("Evidence supports a new descriptive archetype.");
  if (previous.twin.confidenceScore.level !== current.confidenceScore.level)
    reasons.push("Twin confidence band changed.");
  return { majorUpdate: reasons.length > 0, reasons, addedEventIds: added.map((event) => event.eventId) };
}

export function createMajorUpdateSnapshot(input: {
  snapshotId: string; current: AthleteDigitalTwin; previous: DigitalTwinSnapshot | null;
  createdAt: string;
}): DigitalTwinSnapshot | null {
  const assessment = assessDigitalTwinSnapshotUpdate(input.previous, input.current);
  if (!assessment.majorUpdate) return null;
  return createDigitalTwinSnapshot({
    snapshotId: input.snapshotId, twin: input.current,
    previousSnapshotId: input.previous?.snapshotId ?? null,
    reason: assessment.reasons.join(" "), createdAt: input.createdAt,
  });
}
