export const PROJECTION_POLICY = Object.freeze({
  minimumHistoryPoints: 3,
  moderateHistoryPoints: 5,
  highHistoryPoints: 8,
  rapidRelativeChangePer30Days: 0.025,
  plateauRelativeChangePer30Days: 0.003,
  inconsistentResidualRatio: 0.035,
  maximumExtrapolationMultiples: 2.5,
  horizonDampingDays: 180,
  scenarioSpreadFloor: 0.01,
  scenarioSpreadResidualMultiplier: 1.65,
  confidence: {
    base: 100,
    insufficientHistoryCap: 24,
    noBenchmarkCap: 69,
    incompatibleBenchmarkCap: 44,
    missingTrainingContextCap: 74,
    inconsistentTrajectoryCap: 49,
    uncalibratedIntervalCap: 79,
  },
});

export const PROJECTION_HORIZONS = Object.freeze({
  immediate: { days: 0, label: "Current compatible baseline" },
  "30_day": { days: 30, label: "30 days" },
  "90_day": { days: 90, label: "90 days" },
  "6_month": { days: 183, label: "6 months" },
  "12_month": { days: 365, label: "12 months" },
  peak_potential: { days: null, label: "Evidence-bounded peak case" },
  season_peak: { days: null, label: "Current season peak case" },
  career_peak: { days: null, label: "Career peak" },
  return_from_injury: { days: null, label: "Return from injury" },
  off_season: { days: null, label: "Off-season" },
  competition_readiness: { days: 0, label: "Current competition readiness" },
});

