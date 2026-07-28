import { z } from "zod";
import { athleteDigitalTwinSchema } from "@/lib/digitalTwin";

export const digitalTwinSummarySchema = z.object({
  activeTwin: athleteDigitalTwinSchema.nullable(),
  snapshots: z.array(z.object({
    id: z.string(), snapshotId: z.string(), reason: z.string(), createdAt: z.string(),
    sourceEventCount: z.number(), engineVersion: z.string(),
  })),
  auditEvents: z.number(),
});

