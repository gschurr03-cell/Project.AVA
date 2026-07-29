export const BETA_LIMITS = {
  maxActiveAnalysesPerUser: 2,
  maxDailyAnalysisSubmissionsPerUser: 10,
  maxUploadBytes: 512 * 1024 * 1024,
  maxVideoDurationSeconds: 60,
  maxAnalysisRetries: 4,
  maxSupportSubmissionsPerHour: 3,
  maxFeedbackSubmissionsPerHour: 5,
} as const;

export const ANALYSIS_SUBMISSION_ENABLED =
  process.env.ANALYSIS_SUBMISSION_ENABLED !== "false";

export const ONBOARDING_VERSION = "ava-web-beta-onboarding-v1";
export const RETENTION_POLICY_VERSION = "ava-video-retention-draft-v1";
export const TERMS_VERSION = "ava-terms-draft-v1";
export const PRIVACY_VERSION = "ava-privacy-draft-v1";

export const VIDEO_RETENTION_POLICY = {
  retainSourceVideo: true,
  defaultRetentionDays: null,
  allowUserDeletion: false,
  useForModelTraining: false,
  policyVersion: RETENTION_POLICY_VERSION,
} as const;
