import type { CoachingInvalidationTrigger, CoachingState } from "./contracts";

export function shouldRegenerateCoachingState(
  cached: CoachingState | null, trigger: CoachingInvalidationTrigger,
): { regenerate: boolean; reason: string } {
  if (!cached) return { regenerate: true, reason: "No cached CoachingState exists." };
  if (trigger.type === "app_open")
    return { regenerate: false, reason: "Application open serves the active cached CoachingState." };
  if (cached.invalidationContext.processedTriggerIds.includes(trigger.triggerId))
    return { regenerate: false, reason: "Trigger was already processed idempotently." };
  return { regenerate: true, reason: `CoachingState invalidated by ${trigger.type}.` };
}

