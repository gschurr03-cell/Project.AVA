/**
 * Athlete Context Engine (Phase 3). Adapts contributor weights using the athlete's
 * anthropometrics + profile, so AVA never produces identical reasoning for every
 * athlete. All modifiers are configurable multipliers; none fabricate certainty —
 * they nudge relative likelihood, and the adaptation itself is inferred (not measured).
 */

export const ATHLETE_CONTEXT_VERSION = "ava-athlete-context-v1" as const;

export interface AthleteContext {
  heightCm?: number | null;
  trochanterHeightM?: number | null;
  legLengthCm?: number | null;
  bodyMassKg?: number | null;
  sex?: "M" | "F" | string | null;
  ageYears?: number | null;
  trainingAgeYears?: number | null;
  event?: string | null;
  currentPbSeconds?: number | null;
  goalPbSeconds?: number | null;
}

/** Multipliers applied to a contributor's accumulated weight (default 1 = no change). */
export type ContextModifiers = Record<string, number>;

/**
 * Derive per-contributor multipliers from context. Deterministic + transparent:
 *  - Taller / longer-limbed athletes: projection + mobility slightly more likely for
 *    stride-length limits; pure turnover slightly less.
 *  - Lower training age: technical contributors emphasized over advanced strength.
 *  - Higher training age: reactive strength / force emphasized (technique more grooved).
 *  - Heavier athletes: reactive strength / stiffness slightly more relevant.
 */
export function contextModifiers(context: AthleteContext): ContextModifiers {
  const mods: ContextModifiers = {};
  const bump = (id: string, factor: number) => {
    mods[id] = (mods[id] ?? 1) * factor;
  };

  const height = num(context.heightCm);
  const legLength = num(context.legLengthCm);
  const trainingAge = num(context.trainingAgeYears);
  const mass = num(context.bodyMassKg);

  if (height != null && height >= 185) {
    bump("projection", 1.15);
    bump("mobilityRestriction", 1.1);
    bump("frontSideMechanics", 0.92);
  } else if (height != null && height <= 168) {
    bump("frontSideMechanics", 1.1);
    bump("projection", 0.95);
  }

  if (legLength != null && height != null) {
    const ratio = legLength / height; // longer levers → projection/mobility emphasis
    if (ratio >= 0.49) {
      bump("projection", 1.08);
      bump("technicalOverreaching", 1.1);
    }
  }

  if (trainingAge != null) {
    if (trainingAge <= 2) {
      bump("frontSideMechanics", 1.15);
      bump("groundStrikePosition", 1.15);
      bump("timingCoordination", 1.1);
      bump("reactiveStrength", 0.9);
    } else if (trainingAge >= 6) {
      bump("reactiveStrength", 1.12);
      bump("verticalForce", 1.1);
      bump("frontSideMechanics", 0.95);
    }
  }

  if (mass != null && mass >= 85) {
    bump("reactiveStrength", 1.08);
    bump("elasticStiffness", 1.08);
  }

  return mods;
}

/** True when the context carries enough to meaningfully adapt (else engine notes it). */
export function hasMeaningfulContext(context: AthleteContext): boolean {
  return [context.heightCm, context.legLengthCm, context.trainingAgeYears, context.bodyMassKg].some(
    (v) => typeof v === "number" && Number.isFinite(v),
  );
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
