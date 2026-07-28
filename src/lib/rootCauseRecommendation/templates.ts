import type { z } from "zod";
import { explanationTemplateKeySchema } from "./contracts";
type Key=z.infer<typeof explanationTemplateKeySchema>;
export const ADAPTER_TEMPLATES:Record<Key,(input:{limiter:string;relationship:string})=>string>={
  ROOT_CAUSE_CONTEXT:({limiter})=>`Evidence currently supports that this recommendation may address the ${limiter} hypothesis; causality remains bounded by the stored evidence.`,
  SYMPTOM_CONTEXT:({limiter})=>`This recommendation addresses a current symptom while the possible ${limiter} limiter remains under review.`,
  CONSEQUENCE_CONTEXT:({limiter})=>`This recommendation may support a downstream pattern associated with ${limiter}; it does not establish cause.`,
  COMPETING_HYPOTHESIS_CONTEXT:()=>`Competing explanations exist and remain independently represented.`,
  LOW_CONFIDENCE_CONTEXT:()=>`The relationship remains uncertain and additional evidence is needed.`,
  CONFLICTING_EVIDENCE_CONTEXT:()=>`Structured evidence conflicts, so positive influence is withheld.`,
  UNMAPPED_CONTEXT:()=>`No approved catalog mapping exists; baseline recommendation behavior is preserved.`,
  EVIDENCE_REQUEST_CONTEXT:()=>`Additional structured evidence is requested before stronger context is applied.`,
  COACH_CONFIRMED_CONTEXT:({limiter})=>`Coach feedback currently supports the ${limiter} hypothesis without proving causality.`,
  COACH_REJECTED_CONTEXT:({limiter})=>`Coach feedback rejects positive use of the ${limiter} hypothesis.`,
  SHADOW_ONLY_CONTEXT:({limiter})=>`A possible ${limiter} relationship was evaluated in shadow mode and did not change recommendation behavior.`,
};
