/**
 * Session Generator (Phase 12). Builds a complete, individualized training session for a
 * given session type: purpose, exercise selection (sourced from the Phase 7 intervention
 * library and matched to the athlete's limiters), suggested volumes/recoveries scaled by
 * athlete level, coaching cues, monitoring points, adjustment notes, confidence, and
 * evidence. Volumes are SUGGESTIONS and always coach-reviewable. Pure + deterministic.
 */

import { type Confidence, estimated, inferred } from "../models";
import type { InterventionPriority } from "../intervention/models";
import { applyTerminology } from "../coach/preferences";
import type { ExerciseRecommendation, SessionType, TrainingSession } from "./models";
import { SESSION_TEMPLATES, LEVEL_VOLUME_SCALE } from "./config";
import { topLimiters, type PremiumInput } from "./context";

export const SESSION_GENERATOR_VERSION = "ava-premium-sessions-v1" as const;

export function generateSession(input: PremiumInput, sessionType: SessionType): TrainingSession {
  const tmpl = SESSION_TEMPLATES[sessionType];
  const prefs = input.preferences ?? null;
  const word = (s: string) => (prefs ? applyTerminology(s, prefs) : s);
  const scale = LEVEL_VOLUME_SCALE[input.trainingContext.athleteLevel] ?? 1;
  const limiterIds = new Set(topLimiters(input, 4).map((l) => l.metricId));

  // Pick interventions whose qualities match this session type AND the athlete's limiters.
  const candidates = (input.interventions?.priorities ?? []).filter((p) => matchesSession(p, tmpl.associatedQualities));
  const targeted = candidates.filter((p) => p.associatedMetrics.some((m) => limiterIds.has(m)) || p.addressedLimiters.some((m) => limiterIds.has(m)));
  const chosen = (targeted.length ? targeted : candidates).slice(0, 3);

  const exercises: ExerciseRecommendation[] = chosen.map((p): ExerciseRecommendation => ({
    id: `ex-${p.intervention.id}`,
    name: word(p.intervention.name),
    interventionId: p.intervention.id,
    purpose: word(p.reasoning),
    volume: scaleVolume(p.implementationGuidance.typicalVolume, scale),
    recovery: p.implementationGuidance.typicalRest,
    intensity: tmpl.intensity,
    cues: p.implementationGuidance.coachingCues.map(word),
    monitoring: p.expectedImprovements.map((e) => e.label),
    confidence: p.confidence,
    evidence: [`Evidence: ${p.intervention.evidenceStrength}.`, ...p.supportingEvidence.slice(0, 1)],
  }));

  // Fallback exercise from the template when no interventions are available.
  if (exercises.length === 0) {
    exercises.push({
      id: `ex-${sessionType}-base`,
      name: word(`${tmpl.label} work`),
      interventionId: null,
      purpose: word(tmpl.purpose),
      volume: scaleVolume(tmpl.baseVolume, scale),
      recovery: tmpl.baseRecovery,
      intensity: tmpl.intensity,
      cues: tmpl.cues.map(word),
      monitoring: tmpl.monitoring,
      confidence: inferred(0.4, "template-based (no intervention data)"),
      evidence: ["General sprint-training practice (associative)."],
    });
  }

  const confidence: Confidence = chosen.length ? estimated(0.6, "individualized session") : inferred(0.4, "template session");

  return {
    id: `session-${sessionType}`,
    type: sessionType,
    label: tmpl.label,
    purpose: word(tmpl.purpose),
    exercises,
    suggestedVolume: scaleVolume(tmpl.baseVolume, scale),
    suggestedRecovery: tmpl.baseRecovery,
    coachingCues: tmpl.cues.map(word),
    monitoringPoints: tmpl.monitoring,
    adjustmentNotes: tmpl.adjustmentNotes,
    confidence,
    evidence: exercises.flatMap((e) => e.evidence).slice(0, 3),
  };
}

function matchesSession(p: InterventionPriority, qualities: string[]): boolean {
  if (qualities.length === 0) return false;
  const set = new Set(qualities);
  return p.intervention.primaryQualities.some((q) => set.has(q)) || p.associatedMetrics.some((m) => set.has(m)) || p.intervention.secondaryQualities.some((q) => set.has(q));
}

/** Annotate a template volume string with the level scale (suggestion, never prescription). */
function scaleVolume(base: string, scale: number): string {
  if (Math.abs(scale - 1) < 1e-9) return base;
  const pct = Math.round(scale * 100);
  return `${base} (≈${pct}% for level)`;
}
