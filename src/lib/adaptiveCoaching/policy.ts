export const ADAPTIVE_COACHING_POLICY = Object.freeze({
  maximumActiveImprovementFocuses: 2,
  maximumMaintenanceFocuses: 3,
  maximumMonitoringFocuses: 5,
  competitionProtectionDays: 14,
  freshEvidenceDays: 21,
  agingEvidenceDays: 60,
  baseReviewDays: 30,
  impactWeight: { High: 4, Moderate: 3, Low: 1, Unknown: 0 },
  confidenceWeight: 5,
  historyCap: 5,
  recurrenceBonus: 3,
  regressionBonus: 4,
  effectiveMaintenanceThreshold: 0.01,
  ineffectiveRetirementMinimumObservations: 2,
});

