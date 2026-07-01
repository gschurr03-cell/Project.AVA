import type { GaitEvent, GaitSide } from "../events";
import type { StepSegment, StrideSegment } from "./StrideSegments";

/**
 * Convert a `GaitEvent[]` stream into structured step and stride segments.
 * Explainable and defensive: sparse or incomplete event streams yield partial
 * or empty results rather than throwing.
 */
export interface StrideOptions {
  /** Drop a same-side contact that lands within this window of the previous one. */
  minContactSpacingMs?: number;
  /** A step's end (next opposite contact) must fall within this window. */
  maxStepDurationMs?: number;
  /** A stride's end (next same-side contact) must fall within this window. */
  maxStrideDurationMs?: number;
  /** When true, enforce strictly alternating contact sides (drop repeats). */
  requireAlternatingSides?: boolean;
}

const DEFAULTS: Required<StrideOptions> = {
  minContactSpacingMs: 80,
  maxStepDurationMs: 500,
  maxStrideDurationMs: 1000,
  requireAlternatingSides: false,
};

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function resolve(options: StrideOptions): Required<StrideOptions> {
  return {
    minContactSpacingMs: options.minContactSpacingMs ?? DEFAULTS.minContactSpacingMs,
    maxStepDurationMs: options.maxStepDurationMs ?? DEFAULTS.maxStepDurationMs,
    maxStrideDurationMs: options.maxStrideDurationMs ?? DEFAULTS.maxStrideDurationMs,
    requireAlternatingSides: options.requireAlternatingSides ?? DEFAULTS.requireAlternatingSides,
  };
}

/** First element strictly after `afterMs` (ascending array) that matches. */
function firstAfter<T extends { tMs: number }>(
  arr: T[],
  afterMs: number,
  pred: (e: T) => boolean,
): T | undefined {
  for (const e of arr) {
    if (e.tMs > afterMs && pred(e)) return e;
  }
  return undefined;
}

/** Sorted, de-duplicated (and optionally alternating) contact events. */
function prepareContacts(sorted: GaitEvent[], opts: Required<StrideOptions>): GaitEvent[] {
  const lastMsBySide: Record<GaitSide, number> = { left: -Infinity, right: -Infinity };
  const deduped: GaitEvent[] = [];
  for (const c of sorted) {
    if (c.type !== "contact") continue;
    if (c.tMs - lastMsBySide[c.side] < opts.minContactSpacingMs) continue;
    lastMsBySide[c.side] = c.tMs;
    deduped.push(c);
  }
  if (!opts.requireAlternatingSides) return deduped;

  const alternating: GaitEvent[] = [];
  for (const c of deduped) {
    if (alternating.length && alternating[alternating.length - 1].side === c.side) continue;
    alternating.push(c);
  }
  return alternating;
}

export function segmentSteps(events: GaitEvent[], options: StrideOptions = {}): StepSegment[] {
  const opts = resolve(options);
  const sorted = [...events].sort((a, b) => a.tMs - b.tMs);
  const contacts = prepareContacts(sorted, opts);
  const toeOffs = sorted.filter((e) => e.type === "toe_off");
  if (contacts.length === 0) return [];

  const steps: StepSegment[] = [];
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    const toeOff = firstAfter(
      toeOffs,
      contact.tMs,
      (e) => e.side === contact.side && e.tMs - contact.tMs <= opts.maxStepDurationMs,
    );
    const nextOpposite = firstAfter(
      contacts,
      contact.tMs,
      (e) => e.side !== contact.side && e.tMs - contact.tMs <= opts.maxStepDurationMs,
    );

    const durationMs = nextOpposite ? nextOpposite.tMs - contact.tMs : undefined;
    const groundContactMs = toeOff ? toeOff.tMs - contact.tMs : undefined;
    const flightTimeMs =
      toeOff && nextOpposite && nextOpposite.tMs > toeOff.tMs
        ? nextOpposite.tMs - toeOff.tMs
        : undefined;

    const used = [contact.confidence, toeOff?.confidence, nextOpposite?.confidence].filter(
      (x): x is number => typeof x === "number",
    );

    const step: StepSegment = {
      index: i,
      side: contact.side,
      startContactFrame: contact.frame,
      startContactMs: contact.tMs,
      confidence: round3(avg(used)),
      source: "gait_events",
    };
    if (toeOff) {
      step.toeOffFrame = toeOff.frame;
      step.toeOffMs = toeOff.tMs;
    }
    if (nextOpposite) {
      step.nextContactFrame = nextOpposite.frame;
      step.nextContactMs = nextOpposite.tMs;
    }
    if (durationMs != null) step.durationMs = durationMs;
    if (groundContactMs != null) step.groundContactMs = groundContactMs;
    if (flightTimeMs != null) step.flightTimeMs = flightTimeMs;

    steps.push(step);
  }
  return steps;
}

export function segmentStrides(events: GaitEvent[], options: StrideOptions = {}): StrideSegment[] {
  const opts = resolve(options);
  const sorted = [...events].sort((a, b) => a.tMs - b.tMs);
  const contacts = prepareContacts(sorted, opts);
  if (contacts.length < 2) return [];

  const steps = segmentSteps(events, options);

  const strides: StrideSegment[] = [];
  for (const contact of contacts) {
    const nextSameSide = firstAfter(
      contacts,
      contact.tMs,
      (e) => e.side === contact.side && e.tMs - contact.tMs <= opts.maxStrideDurationMs,
    );
    if (!nextSameSide) continue;

    const includedSteps = steps.filter(
      (s) => s.startContactMs >= contact.tMs && s.startContactMs < nextSameSide.tMs,
    );
    const confidenceSource = includedSteps.length
      ? includedSteps.map((s) => s.confidence)
      : [contact.confidence, nextSameSide.confidence];

    strides.push({
      index: 0, // reassigned after sorting
      side: contact.side,
      startContactFrame: contact.frame,
      startContactMs: contact.tMs,
      nextSameSideContactFrame: nextSameSide.frame,
      nextSameSideContactMs: nextSameSide.tMs,
      durationMs: nextSameSide.tMs - contact.tMs,
      stepCount: includedSteps.length,
      steps: includedSteps,
      confidence: round3(avg(confidenceSource)),
      source: "gait_events",
    });
  }

  strides.sort((a, b) => a.startContactMs - b.startContactMs || a.side.localeCompare(b.side));
  return strides.map((stride, index) => ({ ...stride, index }));
}
