/**
 * Scenario comparison (Phase 9). Builds a side-by-side table of the current baseline
 * against one or more saved scenarios — estimated event times, their deltas, and the
 * development-score change — so a coach can compare "improve stride length" vs "improve
 * contact time" at a glance. Pure + deterministic.
 */

import type { SimulationComparison, SimulationScenario } from "./models";
import { EVENTS } from "./config";

export const COMPARISON_ENGINE_VERSION = "ava-simulation-comparison-v1" as const;

export const BASELINE_COLUMN_ID = "current" as const;

export interface ComparisonInput {
  /** Current (baseline) event times and development score. */
  baseline: {
    eventTimes: Record<string, number | null>;
    developmentScore: number;
  };
  scenarios: SimulationScenario[];
  /** The event whose time decides the "best" scenario. */
  primaryEvent?: string;
}

export function compareScenarios(input: ComparisonInput): SimulationComparison {
  const primaryEvent = input.primaryEvent ?? "100m";
  const columns = [
    { id: BASELINE_COLUMN_ID, name: "Current" },
    ...input.scenarios.map((s) => ({ id: s.id, name: s.name })),
  ];

  const events = EVENTS.map((event) => {
    const baselineTime = num(input.baseline.eventTimes[event]);
    const values = [
      { columnId: BASELINE_COLUMN_ID, timeS: baselineTime, deltaS: baselineTime != null ? 0 : null },
      ...input.scenarios.map((s) => {
        const outcome = s.output.eventOutcomes.find((e) => e.event === event);
        const timeS = outcome?.simulatedTimeS ?? null;
        return { columnId: s.id, timeS, deltaS: timeS != null && baselineTime != null ? round(timeS - baselineTime) : null };
      }),
    ];
    return { event, values };
  });

  const developmentScore = [
    { columnId: BASELINE_COLUMN_ID, value: input.baseline.developmentScore, deltaPct: 0 },
    ...input.scenarios.map((s) => ({
      columnId: s.id,
      value: s.output.developmentScore.simulated,
      deltaPct: s.output.developmentScore.simulated - input.baseline.developmentScore,
    })),
  ];

  // Best = lowest simulated primary-event time (deterministic tie-break by id).
  let bestScenarioId: string | null = null;
  let bestTime = Infinity;
  for (const s of [...input.scenarios].sort((a, b) => a.id.localeCompare(b.id))) {
    const t = s.output.eventOutcomes.find((e) => e.event === primaryEvent)?.simulatedTimeS;
    if (t != null && t < bestTime - 1e-9) {
      bestTime = t;
      bestScenarioId = s.id;
    }
  }

  return {
    version: COMPARISON_ENGINE_VERSION,
    baselineLabel: "Current",
    columns,
    events,
    developmentScore,
    bestScenarioId,
  };
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
