export const DIGITAL_TWIN_POLICY = Object.freeze({
  minimumBaselineSamples: 3,
  moderateBaselineSamples: 5,
  highBaselineSamples: 10,
  stableRelativeChangePer30Days: 0.003,
  rapidRelativeChangePer30Days: 0.025,
  highVariationCoefficient: 0.04,
  confidenceGraceDays: 90,
  confidenceDecayPer30Days: 3,
  confidenceMinimumWithEvidence: 20,
  majorUpdateEventThreshold: 5,
});
