/**
 * Acceleration Phase Detection (Phase 5, Part 2).
 *
 * Splits the zone into named phases by detecting changes in the athlete's
 * OWN measured mechanics — never a hardcoded distance. Every boundary comes
 * from a signal already computed elsewhere in this pipeline:
 *
 *   - `initial_movement`   zone start → the first ground contact.
 *   - `projection_phase`   contacts while step length is still growing fast
 *                          (relative step-to-step growth above threshold).
 *   - `drive_phase`        from the end of projection to
 *                          `progression.accelerationDeclineStep` — the same
 *                          field Phase 2 already uses to mean "acceleration
 *                          stopped rising and never recovered."
 *   - `transition_phase`   from the acceleration decline to the final step.
 *   - `end_of_measured_zone` the final step through the calibrated zone exit.
 *
 * A phase with too little supporting data is reported `"insufficient_data"`
 * (empty step list, null averages) rather than a fabricated boundary — this
 * is what keeps detection stable on short/noisy step tables (Part 10's
 * "phase detection is unstable" stop condition).
 */

import type { AccelerationStepRow } from "./steps";
import type { AccelerationIntervalMetric } from "./metrics";
import type { ProgressionAnalysis } from "./progression";

export type AccelerationPhaseType = "initial_movement" | "projection_phase" | "drive_phase" | "transition_phase" | "end_of_measured_zone";

export const PHASE_LABELS: Record<AccelerationPhaseType, string> = {
  initial_movement: "Initial Movement",
  projection_phase: "Projection Phase",
  drive_phase: "Drive Phase",
  transition_phase: "Transition Phase",
  end_of_measured_zone: "End of Measured Zone",
};

export interface AccelerationPhase {
  type: AccelerationPhaseType;
  label: string;
  status: "detected" | "insufficient_data";
  startFrame: number | null;
  endFrame: number | null;
  startDistanceM: number | null;
  endDistanceM: number | null;
  startTimeS: number | null;
  endTimeS: number | null;
  averageVelocityMps: number | null;
  averageAccelerationMps2: number | null;
  averageStepLengthM: number | null;
  averageStepFrequencyHz: number | null;
  stepNumbers: number[];
}

/** A step-to-step growth rate below this counts as "no longer rapidly growing." */
const PROJECTION_GROWTH_THRESHOLD = 0.08;

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function phaseFromSteps(type: AccelerationPhaseType, steps: AccelerationStepRow[], endDistanceOverride?: number, endTimeOverride?: number, endFrameOverride?: number): AccelerationPhase {
  if (steps.length === 0) {
    return {
      type,
      label: PHASE_LABELS[type],
      status: "insufficient_data",
      startFrame: null,
      endFrame: null,
      startDistanceM: null,
      endDistanceM: null,
      startTimeS: null,
      endTimeS: null,
      averageVelocityMps: null,
      averageAccelerationMps2: null,
      averageStepLengthM: null,
      averageStepFrequencyHz: null,
      stepNumbers: [],
    };
  }
  const first = steps[0];
  const last = steps[steps.length - 1];
  return {
    type,
    label: PHASE_LABELS[type],
    status: "detected",
    startFrame: first.contactFrame,
    endFrame: endFrameOverride ?? last.contactFrame,
    startDistanceM: first.contactDistanceM,
    endDistanceM: endDistanceOverride ?? last.contactDistanceM,
    startTimeS: first.elapsedTimeS,
    endTimeS: endTimeOverride ?? last.elapsedTimeS,
    averageVelocityMps: mean(steps.map((s) => s.intervalVelocityMps)),
    averageAccelerationMps2: mean(steps.map((s) => s.averageAccelerationMps2).filter((v): v is number => v != null)),
    averageStepLengthM: mean(steps.map((s) => s.stepLengthM)),
    averageStepFrequencyHz: mean(steps.map((s) => s.stepFrequencyHz)),
    stepNumbers: steps.map((s) => s.stepNumber),
  };
}

/** First index (>=1) where step-length growth relative to the previous step
 *  drops below the threshold — i.e., projection has stopped rapidly growing.
 *  Returns `steps.length` (projection spans everything) if growth never
 *  decelerates within the observed steps. */
function findProjectionEndIndex(steps: AccelerationStepRow[]): number {
  if (steps.length < 3) return steps.length;
  for (let i = 2; i < steps.length; i++) {
    const prevLength = steps[i - 1].stepLengthM;
    if (prevLength <= 0) continue;
    const growth = (steps[i].stepLengthM - prevLength) / prevLength;
    if (growth < PROJECTION_GROWTH_THRESHOLD) return i;
  }
  return steps.length;
}

function intervalNear(intervalMetrics: AccelerationIntervalMetric[] | undefined, distanceM: number): AccelerationIntervalMetric | null {
  if (!intervalMetrics?.length) return null;
  return intervalMetrics.find((m) => distanceM >= m.startM && distanceM <= m.endM) ?? null;
}

export function detectAccelerationPhases(input: {
  startEvent: { frame: number | null; timestamp: number | null };
  analysisZone: { entryDistanceM: number; exitDistanceM: number } | null;
  steps: AccelerationStepRow[];
  progression: ProgressionAnalysis | null;
  intervalMetrics?: AccelerationIntervalMetric[];
}): AccelerationPhase[] {
  const { startEvent, analysisZone, steps, progression, intervalMetrics } = input;
  if (steps.length === 0) {
    return (["initial_movement", "projection_phase", "drive_phase", "transition_phase", "end_of_measured_zone"] as AccelerationPhaseType[]).map((t) => phaseFromSteps(t, []));
  }

  // --- initial_movement: zone start -> first ground contact. No step yet
  // exists inside this span, so averages come from the calibrated interval
  // covering it when one exists, never fabricated otherwise.
  const firstStep = steps[0];
  const initialInterval = intervalNear(intervalMetrics, firstStep.contactDistanceM);
  const initialMovement: AccelerationPhase = {
    type: "initial_movement",
    label: PHASE_LABELS.initial_movement,
    status: startEvent.frame != null ? "detected" : "insufficient_data",
    startFrame: startEvent.frame,
    endFrame: firstStep.contactFrame,
    startDistanceM: analysisZone?.entryDistanceM ?? null,
    endDistanceM: firstStep.contactDistanceM,
    startTimeS: startEvent.timestamp,
    endTimeS: firstStep.elapsedTimeS,
    averageVelocityMps: initialInterval?.velocityMps ?? null,
    averageAccelerationMps2: initialInterval?.accelerationMps2 ?? null,
    averageStepLengthM: null,
    averageStepFrequencyHz: null,
    stepNumbers: [],
  };

  const projectionEndIdx = Math.max(1, findProjectionEndIndex(steps));
  const declineStepNumber = progression?.accelerationDeclineStep?.stepNumber ?? null;
  let driveEndIdx = declineStepNumber != null ? steps.findIndex((s) => s.stepNumber === declineStepNumber) : -1;
  if (driveEndIdx <= projectionEndIdx) driveEndIdx = -1; // decline landed inside/before projection — not a real drive-phase boundary

  const lastIdx = steps.length - 1;
  const projectionSteps = steps.slice(0, Math.min(projectionEndIdx, steps.length));

  let driveSteps: AccelerationStepRow[] = [];
  let transitionSteps: AccelerationStepRow[] = [];
  let endSteps: AccelerationStepRow[] = [];

  if (driveEndIdx > projectionEndIdx && driveEndIdx < lastIdx) {
    driveSteps = steps.slice(projectionEndIdx, driveEndIdx);
    transitionSteps = steps.slice(driveEndIdx, lastIdx);
    endSteps = steps.slice(lastIdx);
  } else if (projectionEndIdx < lastIdx) {
    // No measurable acceleration decline within the zone — drive extends to
    // the second-to-last step; transition is genuinely not observable here.
    driveSteps = steps.slice(projectionEndIdx, lastIdx);
    endSteps = steps.slice(lastIdx);
  } else {
    // Too few steps to distinguish drive/transition from projection at all.
    endSteps = steps.slice(lastIdx);
  }

  const zoneExitDistance = analysisZone?.exitDistanceM ?? null;
  const lastStep = steps[lastIdx];
  const endInterval = zoneExitDistance != null ? intervalNear(intervalMetrics, zoneExitDistance) : null;

  const phases: AccelerationPhase[] = [
    initialMovement,
    phaseFromSteps("projection_phase", projectionSteps),
    phaseFromSteps("drive_phase", driveSteps),
    phaseFromSteps("transition_phase", transitionSteps),
    {
      ...phaseFromSteps("end_of_measured_zone", endSteps, zoneExitDistance ?? undefined),
      averageVelocityMps: endInterval?.velocityMps ?? mean(endSteps.map((s) => s.intervalVelocityMps)),
      averageAccelerationMps2: endInterval?.accelerationMps2 ?? mean(endSteps.map((s) => s.averageAccelerationMps2).filter((v): v is number => v != null)),
    },
  ];

  // Silence unused-var noise in the rare case endSteps/lastStep aren't read further.
  void lastStep;
  return phases;
}
