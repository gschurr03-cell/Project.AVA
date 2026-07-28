import type { z } from "zod";
import {
  applicabilityDecisionSchema, evidenceGradeDecisionSchema,
} from "./contracts";
export type EvidenceGradeDecision = z.infer<typeof evidenceGradeDecisionSchema>;
export type ApplicabilityDecision = z.infer<typeof applicabilityDecisionSchema>;
export type {
  ResearchSource, ResearchClaim, ResearchEvidenceLink, ResearchCitation,
  ResearchRetrievalInput, ResearchRetrievalResult, ResearchMetricDefinition,
} from "./contracts";

