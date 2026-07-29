export const ZONE_STEP_MEASUREMENT_VERSION = "zone-step-metrics-v1" as const;
export type ZoneStepSide = "left" | "right";

export type ZoneContactClassification =
  | "before_zone"
  | "inside_zone"
  | "after_zone"
  | "boundary_ambiguous";

export type ZoneStepQualityFlag =
  | "boundary_ambiguous"
  | "low_projection_confidence"
  | "missing_post_zone_contact"
  | "insufficient_bilateral_samples"
  | "non_alternating_sequence"
  | "non_forward_interval"
  | "implausible_step_length";

export interface ZoneAxisPoint {
  x: number;
  y: number;
}

export interface CanonicalContactInput extends ZoneAxisPoint {
  id: string;
  side: ZoneStepSide;
  timeS: number;
  sourceFrameIndex: number;
  confidence: number;
}

export interface ZoneStepInput {
  contacts: CanonicalContactInput[];
  start: ZoneAxisPoint;
  finish: ZoneAxisPoint;
  distanceM: number;
  /** Deterministic classification tolerance at either gate. Defaults to 5 cm. */
  boundaryToleranceM?: number;
  minimumProjectionConfidence?: number;
  plausibleStepLengthM?: { min: number; max: number };
}

export interface ClassifiedZoneContact extends CanonicalContactInput {
  classification: ZoneContactClassification;
  countedInZone: boolean;
  longitudinalM: number;
  lateralM: number;
  signedDistanceFromStartM: number;
  signedDistanceFromFinishM: number;
  qualityFlags: ZoneStepQualityFlag[];
}

export interface ZoneStepInterval {
  id: string;
  index: number;
  fromContactId: string;
  toContactId: string;
  fromSide: ZoneStepSide;
  toSide: ZoneStepSide;
  kind: "internal" | "trailing_exit";
  longitudinalLengthM: number | null;
  rawLongitudinalDisplacementM: number;
  lateralDisplacementM: number;
  durationS: number;
  valid: boolean;
  qualityFlags: ZoneStepQualityFlag[];
}

export interface ZoneStepSummary {
  schemaVersion: typeof ZONE_STEP_MEASUREMENT_VERSION;
  measurementVersion: typeof ZONE_STEP_MEASUREMENT_VERSION;
  zoneDefinition: {
    start: ZoneAxisPoint;
    finish: ZoneAxisPoint;
    distanceM: number;
    boundaryToleranceM: number;
  };
  runningDirection: "start_to_finish";
  contactGroups: {
    allDetected: string[];
    beforeZone: string[];
    insideZone: string[];
    firstPostZone: string | null;
    excludedAfterZone: string[];
    boundaryAmbiguous: string[];
  };
  stepWindow: {
    firstInZoneContactId: string | null;
    lastInZoneContactId: string | null;
    firstPostZoneContactId: string | null;
    inZoneContactCount: number;
    measuredIntervalCount: number;
    trailingExitIntervalIncluded: boolean;
  };
  stepCountInZone: number;
  stepLengthCount: number;
  averageStepLengthM: number | null;
  firstInZoneContactId: string | null;
  lastInZoneContactId: string | null;
  firstPostZoneContactId: string | null;
  contacts: ClassifiedZoneContact[];
  intervals: ZoneStepInterval[];
  summaries: {
    averageStepLengthM: number | null;
    medianStepLengthM: number | null;
    minStepLengthM: number | null;
    maxStepLengthM: number | null;
    leftStepAverageM: number | null;
    rightStepAverageM: number | null;
    leftStepSampleCount: number;
    rightStepSampleCount: number;
    stepLengthAsymmetryPct: number | null;
    stepFrequencyHz: number | null;
    leftStepFrequencyHz: number | null;
    rightStepFrequencyHz: number | null;
    averageContactTimeS: number | null;
    averageFlightTimeS: number | null;
  };
  confidence: {
    score: number;
    label: "high" | "moderate" | "low" | "insufficient";
    reason: string;
  };
  eventBoundaries: {
    contactEvents: Array<{
      contactId: string;
      status: "full_event" | "partial_event" | "excluded" | "boundary_ambiguous";
      durationS: number | null;
    }>;
    flightEvents: Array<{
      fromContactId: string;
      toContactId: string;
      status: "full_event" | "partial_event" | "excluded" | "boundary_ambiguous";
      durationS: number | null;
    }>;
  };
  qualityFlags: ZoneStepQualityFlag[];
}

const finitePoint = (p: ZoneAxisPoint) => Number.isFinite(p.x) && Number.isFinite(p.y);
const rounded = (value: number) => Math.round(value * 1e6) / 1e6;
const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Measures contacts on the canonical longitudinal sprint axis. The first length
 * starts at the first in-zone contact; the only permitted outside contact is the
 * first contact after the finish, which closes the final in-zone interval.
 */
export function analyzeZoneSteps(input: ZoneStepInput): ZoneStepSummary {
  if (
    !finitePoint(input.start) ||
    !finitePoint(input.finish) ||
    !Number.isFinite(input.distanceM) ||
    input.distanceM <= 0
  ) {
    throw new Error("Zone step analysis requires finite gates and a positive distance.");
  }

  const dx = input.finish.x - input.start.x;
  const dy = input.finish.y - input.start.y;
  const axisSpan = Math.hypot(dx, dy);
  if (axisSpan <= 1e-9) throw new Error("Zone gates must define a non-zero sprint axis.");

  const ux = dx / axisSpan;
  const uy = dy / axisSpan;
  const px = -uy;
  const py = ux;
  const metresPerCanonicalUnit = input.distanceM / axisSpan;
  const toleranceM = Math.max(0, input.boundaryToleranceM ?? 0.05);
  const minConfidence = input.minimumProjectionConfidence ?? 0.45;
  const plausible = input.plausibleStepLengthM ?? { min: 0.25, max: 4 };

  const contacts = [...input.contacts]
    .filter((contact) => finitePoint(contact) && Number.isFinite(contact.timeS))
    .sort((a, b) => a.timeS - b.timeS || a.sourceFrameIndex - b.sourceFrameIndex || a.id.localeCompare(b.id))
    .map<ClassifiedZoneContact>((contact) => {
      const relX = contact.x - input.start.x;
      const relY = contact.y - input.start.y;
      const longitudinalM = (relX * ux + relY * uy) * metresPerCanonicalUnit;
      const lateralM = (relX * px + relY * py) * metresPerCanonicalUnit;
      const nearBoundary =
        Math.abs(longitudinalM) <= toleranceM ||
        Math.abs(longitudinalM - input.distanceM) <= toleranceM;
      const classification: ZoneContactClassification = nearBoundary
        ? "boundary_ambiguous"
        : longitudinalM < 0
          ? "before_zone"
          : longitudinalM > input.distanceM
            ? "after_zone"
            : "inside_zone";
      const qualityFlags: ZoneStepQualityFlag[] = [];
      if (nearBoundary) qualityFlags.push("boundary_ambiguous");
      if (contact.confidence < minConfidence) qualityFlags.push("low_projection_confidence");
      return {
        ...contact,
        classification,
        countedInZone: longitudinalM >= 0 && longitudinalM <= input.distanceM,
        longitudinalM: rounded(longitudinalM),
        lateralM: rounded(lateralM),
        signedDistanceFromStartM: rounded(longitudinalM),
        signedDistanceFromFinishM: rounded(longitudinalM - input.distanceM),
        qualityFlags,
      };
    });

  const inZone = contacts.filter((contact) => contact.countedInZone);
  const last = inZone[inZone.length - 1] ?? null;
  const firstPost = last
    ? contacts.find(
        (contact) =>
          contact.timeS > last.timeS &&
          (contact.classification === "after_zone" ||
            (contact.classification === "boundary_ambiguous" && !contact.countedInZone)),
      ) ?? null
    : null;

  const intervalContacts = firstPost ? [...inZone, firstPost] : inZone;
  const intervals: ZoneStepInterval[] = [];
  for (let i = 1; i < intervalContacts.length; i++) {
    const from = intervalContacts[i - 1];
    const to = intervalContacts[i];
    const delta = to.longitudinalM - from.longitudinalM;
    const lateral = to.lateralM - from.lateralM;
    const flags: ZoneStepQualityFlag[] = [];
    if (from.side === to.side) flags.push("non_alternating_sequence");
    if (delta <= 0) flags.push("non_forward_interval");
    if (delta < plausible.min || delta > plausible.max) flags.push("implausible_step_length");
    if (from.qualityFlags.includes("low_projection_confidence") || to.qualityFlags.includes("low_projection_confidence")) {
      flags.push("low_projection_confidence");
    }
    const valid = !flags.some((flag) =>
      flag === "non_alternating_sequence" ||
      flag === "non_forward_interval" ||
      flag === "implausible_step_length"
    );
    intervals.push({
      id: `interval-${from.id}--${to.id}`,
      index: intervals.length + 1,
      fromContactId: from.id,
      toContactId: to.id,
      fromSide: from.side,
      toSide: to.side,
      kind: i === intervalContacts.length - 1 && firstPost ? "trailing_exit" : "internal",
      longitudinalLengthM: valid ? rounded(delta) : null,
      rawLongitudinalDisplacementM: rounded(delta),
      lateralDisplacementM: rounded(lateral),
      durationS: rounded(to.timeS - from.timeS),
      valid,
      qualityFlags: flags,
    });
  }

  const qualityFlags = new Set<ZoneStepQualityFlag>();
  for (const contact of contacts) for (const flag of contact.qualityFlags) qualityFlags.add(flag);
  for (const interval of intervals) for (const flag of interval.qualityFlags) qualityFlags.add(flag);
  if (last && !firstPost) qualityFlags.add("missing_post_zone_contact");
  const lengths = intervals
    .map((interval) => interval.longitudinalLengthM)
    .filter((value): value is number => value != null);
  const leftLengths = intervals
    .filter((interval) => interval.toSide === "left" && interval.longitudinalLengthM != null)
    .map((interval) => interval.longitudinalLengthM as number);
  const rightLengths = intervals
    .filter((interval) => interval.toSide === "right" && interval.longitudinalLengthM != null)
    .map((interval) => interval.longitudinalLengthM as number);
  const leftAverage = mean(leftLengths);
  const rightAverage = mean(rightLengths);
  const bilateralSufficient = leftLengths.length >= 2 && rightLengths.length >= 2;
  const asymmetry = bilateralSufficient && leftAverage != null && rightAverage != null
    ? Math.abs(leftAverage - rightAverage) / Math.max(leftAverage, rightAverage) * 100
    : null;
  const durations = intervals
    .filter((interval) => interval.valid && interval.durationS > 0)
    .map((interval) => interval.durationS);
  const leftDurations = intervals.filter((interval) => interval.valid && interval.toSide === "left").map((interval) => interval.durationS);
  const rightDurations = intervals.filter((interval) => interval.valid && interval.toSide === "right").map((interval) => interval.durationS);
  const projectionConfidence = contacts.length
    ? mean(contacts.map((contact) => Math.max(0, Math.min(1, contact.confidence)))) ?? 0
    : 0;
  const sampleFactor = Math.min(1, lengths.length / 4);
  const confidenceScore = rounded(projectionConfidence * sampleFactor);
  const confidenceLabel = lengths.length < 2
    ? "insufficient"
    : confidenceScore >= 0.85
      ? "high"
      : confidenceScore >= 0.65
        ? "moderate"
        : "low";
  if (!bilateralSufficient && (leftLengths.length || rightLengths.length)) {
    qualityFlags.add("insufficient_bilateral_samples");
  }
  const after = contacts.filter((contact) => contact.classification === "after_zone");

  return {
    schemaVersion: ZONE_STEP_MEASUREMENT_VERSION,
    measurementVersion: ZONE_STEP_MEASUREMENT_VERSION,
    zoneDefinition: {
      start: { ...input.start },
      finish: { ...input.finish },
      distanceM: input.distanceM,
      boundaryToleranceM: toleranceM,
    },
    runningDirection: "start_to_finish",
    contactGroups: {
      allDetected: contacts.map((contact) => contact.id),
      beforeZone: contacts.filter((contact) => contact.classification === "before_zone").map((contact) => contact.id),
      insideZone: inZone.map((contact) => contact.id),
      firstPostZone: firstPost?.id ?? null,
      excludedAfterZone: after.filter((contact) => contact.id !== firstPost?.id).map((contact) => contact.id),
      boundaryAmbiguous: contacts.filter((contact) => contact.classification === "boundary_ambiguous").map((contact) => contact.id),
    },
    stepWindow: {
      firstInZoneContactId: inZone[0]?.id ?? null,
      lastInZoneContactId: last?.id ?? null,
      firstPostZoneContactId: firstPost?.id ?? null,
      inZoneContactCount: inZone.length,
      measuredIntervalCount: lengths.length,
      trailingExitIntervalIncluded: intervals.some((interval) => interval.kind === "trailing_exit" && interval.valid),
    },
    stepCountInZone: inZone.length,
    stepLengthCount: lengths.length,
    averageStepLengthM: lengths.length
      ? rounded(lengths.reduce((sum, value) => sum + value, 0) / lengths.length)
      : null,
    firstInZoneContactId: inZone[0]?.id ?? null,
    lastInZoneContactId: last?.id ?? null,
    firstPostZoneContactId: firstPost?.id ?? null,
    contacts,
    intervals,
    summaries: {
      averageStepLengthM: mean(lengths) == null ? null : rounded(mean(lengths)!),
      medianStepLengthM: median(lengths) == null ? null : rounded(median(lengths)!),
      minStepLengthM: lengths.length ? Math.min(...lengths) : null,
      maxStepLengthM: lengths.length ? Math.max(...lengths) : null,
      leftStepAverageM: leftAverage == null ? null : rounded(leftAverage),
      rightStepAverageM: rightAverage == null ? null : rounded(rightAverage),
      leftStepSampleCount: leftLengths.length,
      rightStepSampleCount: rightLengths.length,
      stepLengthAsymmetryPct: asymmetry == null ? null : rounded(asymmetry),
      stepFrequencyHz: durations.length && mean(durations) ? rounded(1 / mean(durations)!) : null,
      leftStepFrequencyHz: leftDurations.length && mean(leftDurations) ? rounded(1 / mean(leftDurations)!) : null,
      rightStepFrequencyHz: rightDurations.length && mean(rightDurations) ? rounded(1 / mean(rightDurations)!) : null,
      averageContactTimeS: null,
      averageFlightTimeS: null,
    },
    confidence: {
      score: confidenceScore,
      label: confidenceLabel,
      reason: lengths.length < 2
        ? "Fewer than two valid authoritative step intervals."
        : `${lengths.length} valid intervals with ${Math.round(projectionConfidence * 100)}% mean projection confidence.`,
    },
    eventBoundaries: {
      contactEvents: [],
      flightEvents: [],
    },
    qualityFlags: [...qualityFlags],
  };
}
