import { z } from "zod";

import { explainableAnalysisResultSchema } from "@/lib/analysis/resultContract";
import { observationSchema } from "@/lib/observations";
import { interpretationResultSchema } from "@/lib/intelligence/interpretations";
import { recommendationResultSchema } from "@/lib/intelligence/recommendationEngine";
import { priorityResultSchema } from "@/lib/intelligence/priorityEngine";

export const COACH_REPORT_ENGINE_VERSION = "ava-coach-report-v1";
export const COACH_REPORT_TEMPLATE_VERSION = "ava-coach-report-template-v1";

export const reportAudienceSchema = z.enum(["athlete", "coach"]);
export const reportStatusSchema = z.enum([
  "ready", "limited", "technique_only", "timing_only", "experimental",
  "insufficient_evidence", "processing", "failed",
]);
export const reportMetricStatusSchema = z.enum([
  "trusted", "limited", "experimental", "withheld", "unavailable",
]);

export const reportMetricSchema = z.object({
  metricId: z.string().min(1),
  name: z.string().min(1),
  value: z.number().finite().nullable(),
  unit: z.string(),
  phase: z.string().nullable(),
  status: reportMetricStatusSchema,
  confidence: z.string(),
  reason: z.string().nullable(),
  source: z.string().min(1),
});

export const reportPrioritySchema = z.object({
  priorityId: z.string().min(1),
  recommendationId: z.string().min(1),
  title: z.string().min(1),
  whyItMatters: z.string().min(1),
  action: z.string().min(1),
  confidence: z.string().min(1),
  expectedImpact: z.string().min(1),
  evidence: z.array(z.string()),
  monitoring: z.string().min(1),
});

export const coachReportSchema = z.object({
  reportId: z.string().min(1),
  analysisId: z.string().min(1),
  sessionId: z.string().min(1),
  athleteId: z.string().min(1),
  audience: reportAudienceSchema,
  status: reportStatusSchema,
  generatedAt: z.string().datetime(),
  reportEngineVersion: z.literal(COACH_REPORT_ENGINE_VERSION),
  templateVersion: z.literal(COACH_REPORT_TEMPLATE_VERSION),
  sourceVersions: z.object({
    analysis: z.string().min(1),
    observations: z.string().min(1),
    interpretations: z.string().min(1),
    recommendations: z.string().min(1),
    priorities: z.string().min(1),
  }),
  trustBanner: z.object({
    label: z.string().min(1),
    summary: z.string().min(1),
    experimental: z.boolean(),
  }),
  executiveSummary: z.array(z.string()).min(1).max(6),
  topPriorities: z.array(reportPrioritySchema).max(3),
  strengths: z.array(z.object({
    priorityId: z.string(), title: z.string(), summary: z.string(), confidence: z.string(),
  })),
  metricHighlights: z.array(reportMetricSchema),
  techniqueFindings: z.array(z.object({
    interpretationId: z.string(), title: z.string(), summary: z.string(),
    confidence: z.string(), evidenceQuality: z.string(), phase: z.string(),
  })),
  monitoringPlan: z.array(z.string()),
  nextCapture: z.array(z.string()).min(1),
  unavailable: z.array(z.object({ label: z.string(), reason: z.string() })),
  limitations: z.array(z.string()),
  methodology: z.array(z.string()).min(1),
  researchEvidence: z.array(z.object({
    claimId: z.string(), evidenceGrade: z.string(), summary: z.string(),
    applicability: z.string(), conflicting: z.boolean(),
    citations: z.array(z.object({ shortCitation: z.string(), formattedCitation: z.string(), url: z.string().url().nullable() })),
  })),
  compositionTrace: z.array(z.string()),
}).superRefine((report, ctx) => {
  const ids = report.topPriorities.map((item) => item.priorityId);
  if (new Set(ids).size !== ids.length)
    ctx.addIssue({ code: "custom", message: "Duplicate report priorities." });
  for (const metric of report.metricHighlights)
    if (metric.status !== "trusted" && metric.status !== "limited" && metric.status !== "experimental" && metric.value !== null)
      ctx.addIssue({ code: "custom", message: `Unavailable metric ${metric.metricId} contains a value.` });
});
export type CoachReport = z.infer<typeof coachReportSchema>;

export const coachReportInputSchema = z.object({
  result: explainableAnalysisResultSchema,
  observations: z.array(observationSchema),
  interpretations: interpretationResultSchema,
  recommendations: recommendationResultSchema,
  priorities: priorityResultSchema,
  audience: reportAudienceSchema,
  athleteName: z.string().min(1),
  sessionName: z.string().min(1),
  researchEvidence: z.array(z.object({
    claimId: z.string(), evidenceGrade: z.string(), summary: z.string(),
    applicability: z.string(), conflicting: z.boolean(),
    citations: z.array(z.object({ shortCitation: z.string(), formattedCitation: z.string(), url: z.string().url().nullable() })),
  })).default([]),
});
export type CoachReportInput = z.infer<typeof coachReportInputSchema>;
