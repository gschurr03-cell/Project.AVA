import type { z } from "zod";

import {
  observationCategorySchema,
  observationConfidenceSchema,
  observationSeveritySchema,
  observationSideSchema,
  observationStatusSchema,
} from "./contracts";

export type ObservationCategory = z.infer<typeof observationCategorySchema>;
export type ObservationConfidence = z.infer<typeof observationConfidenceSchema>;
export type ObservationSeverity = z.infer<typeof observationSeveritySchema>;
export type ObservationSide = z.infer<typeof observationSideSchema>;
export type ObservationStatus = z.infer<typeof observationStatusSchema>;

export type {
  CompletedAnalysisObservationInput,
  Observation,
  ObservationDebugTraceEntry,
  ObservationEvidence,
  ObservationGenerationResult,
  ObservationLimitation,
  ObservationMetricSignal,
} from "./contracts";
