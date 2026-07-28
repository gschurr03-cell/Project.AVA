import { z } from "zod";
import { coachingStateSchema } from "@/lib/adaptiveCoaching";

export const cachedCoachingStateSummarySchema = z.object({
  activeState: coachingStateSchema.nullable(),
  pendingInvalidations: z.number(),
  stateHistory: z.array(z.object({
    coachingStateId: z.string(), generatedAt: z.string(), inputFingerprint: z.string(),
  })),
});

