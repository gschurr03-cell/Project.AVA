import { z } from "zod";
import { projectionInputSchema, projectionOutputSchema } from "@/lib/projectionEngine";

export const projectionDeveloperSummarySchema = z.object({
  snapshots: z.array(z.object({
    id: z.string(), athleteId: z.string(), projectionId: z.string(),
    projectionType: z.string(), targetMetric: z.string(),
    engineVersion: z.string(), schemaVersion: z.string(),
    input: projectionInputSchema, output: projectionOutputSchema,
    createdAt: z.string(),
  })),
});

