import { z } from "zod";

export const MOBILE_BETA_RESULT_CONTRACT = "ava-mobile-beta-result-v1" as const;

const confidenceSchema = z.object({
  level: z.enum(["high", "moderate", "low", "insufficientEvidence", "notEvaluated"]),
  explanation: z.string().min(1).max(2_000),
  factors: z.array(z.string().min(1).max(500)).max(30),
  limitations: z.array(z.string().min(1).max(500)).max(30),
}).strict();

const provenanceSchema = z.object({
  manifestID: z.string().uuid(),
  snapshotID: z.string().uuid(),
  engineVersion: z.string().min(1).max(100),
  contractVersion: z.string().min(1).max(100),
  generatedAt: z.string().datetime(),
  activatedAt: z.string().datetime(),
}).strict();

export const mobileRecommendationSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  category: z.string().min(1).max(100),
  purpose: z.string().min(1).max(2_000),
  rationale: z.string().min(1).max(4_000),
  associatedMuscleGroups: z.array(z.string().min(1).max(100)).max(30),
  priorityExplanation: z.array(z.string().min(1).max(1_000)).max(30),
  expectedReturn: z.string().max(1_000).nullable(),
  confidence: confidenceSchema,
  evidenceIDs: z.array(z.string().min(1).max(200)).max(100),
  dependencies: z.array(z.string().min(1).max(500)).max(30),
  contraindications: z.array(z.string().min(1).max(500)).max(30),
  status: z.enum(["currentFocus", "secondary", "maintenance", "monitoring", "retired", "blocked", "awaitingEvidence"]),
  version: z.string().min(1).max(100),
}).strict();

export const mobileCoachReportSchema = z.object({
  title: z.string().min(1).max(300),
  executiveSummary: z.string().min(1).max(8_000),
  findings: z.array(z.string().min(1).max(2_000)).max(100),
  strengths: z.array(z.string().min(1).max(2_000)).max(100),
  limiters: z.array(z.string().min(1).max(2_000)).max(100),
  priorities: z.array(z.string().min(1).max(2_000)).max(100),
  maintenance: z.array(z.string().min(1).max(2_000)).max(100),
  monitoring: z.array(z.string().min(1).max(2_000)).max(100),
  unknowns: z.array(z.string().min(1).max(2_000)).max(100),
  evidenceRequests: z.array(z.string().min(1).max(2_000)).max(100),
  nextAssessment: z.string().max(2_000).nullable(),
  confidence: confidenceSchema,
  provenance: provenanceSchema,
}).strict();

export const mobileBetaResultPackageSchema = z.object({
  contractVersion: z.literal(MOBILE_BETA_RESULT_CONTRACT),
  accountID: z.string().uuid(),
  athleteID: z.string().uuid(),
  analysisID: z.string().uuid(),
  manifestID: z.string().uuid(),
  role: z.enum(["athlete", "coach", "internalTester"]),
  home: z.object({
    currentFocus: z.string().max(2_000).nullable(),
    highestPriority: z.string().max(2_000).nullable(),
    latestAnalysisStatus: z.string().min(1).max(300),
    recentChange: z.string().max(2_000).nullable(),
    maintenance: z.string().max(2_000).nullable(),
    monitoring: z.string().max(2_000).nullable(),
    nextAssessment: z.string().max(2_000).nullable(),
    actionRequired: z.string().max(2_000).nullable(),
    latestReportID: z.string().uuid().nullable(),
    lastSynchronizedAt: z.string().datetime().nullable(),
    stale: z.boolean(),
  }).strict(),
  history: z.array(z.unknown()).max(100),
  report: mobileCoachReportSchema,
  observations: z.array(z.unknown()).max(100),
  rootCauses: z.array(z.unknown()).max(50),
  recommendations: z.array(mobileRecommendationSchema).max(100),
  optimization: z.unknown().nullable(),
  coachingState: z.unknown().nullable(),
  benchmark: z.unknown().nullable(),
  projection: z.unknown().nullable(),
  digitalTwin: z.array(z.unknown()).max(50),
  progress: z.array(z.unknown()).max(100),
  evidence: z.array(z.unknown()).max(200),
  synchronizedAt: z.string().datetime(),
}).strict();

export type MobileBetaResultPackage = z.infer<typeof mobileBetaResultPackageSchema>;

export function assertManifestScopedMobilePackage(input: MobileBetaResultPackage, manifest: {
  manifestID: string; analysisID: string; athleteID: string; authoritative: boolean; status: string;
}) {
  if (!manifest.authoritative || manifest.status !== "active") {
    throw new Error("Mobile beta resources require an authoritative active manifest.");
  }
  if (input.manifestID !== manifest.manifestID ||
      input.report.provenance.manifestID !== manifest.manifestID ||
      input.analysisID !== manifest.analysisID || input.athleteID !== manifest.athleteID) {
    throw new Error("Mixed-manifest or cross-athlete mobile package rejected.");
  }
  return input;
}
