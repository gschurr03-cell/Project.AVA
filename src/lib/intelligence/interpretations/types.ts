import type { z } from "zod";

import {
  evidenceQualitySchema,
  interpretationConfidenceSchema,
  interpretationStatusSchema,
  type InterpretationContext,
} from "./contracts";

export type InterpretationConfidence = z.infer<typeof interpretationConfidenceSchema>;
export type InterpretationStatus = z.infer<typeof interpretationStatusSchema>;
export type EvidenceQuality = z.infer<typeof evidenceQualitySchema>;
export type { InterpretationContext };
