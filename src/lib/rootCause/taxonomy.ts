import type { z } from "zod";
import { limiterKeySchema, ROOT_CAUSE_TAXONOMY_VERSION } from "./contracts";

export type LimiterKey = z.infer<typeof limiterKeySchema>;
export const ROOT_CAUSE_LIBRARY: ReadonlyArray<{
  key: LimiterKey; label: string; scope: "mechanical" | "coordination" | "phase" | "unknown";
  nonClinical: true; version: typeof ROOT_CAUSE_TAXONOMY_VERSION;
}> = [
  ["force_production","Force production","mechanical"],["projection_mechanics","Projection mechanics","phase"],
  ["front_side_organization","Front-side organization","mechanical"],["back_side_dominance","Back-side dominance","mechanical"],
  ["pelvic_control","Pelvic control","mechanical"],["posture","Posture","mechanical"],
  ["hip_mobility","Hip mobility","mechanical"],["ankle_stiffness","Ankle stiffness","mechanical"],
  ["ground_contact_quality","Ground contact quality","mechanical"],["elastic_return","Elastic return","mechanical"],
  ["stride_rhythm","Stride rhythm","coordination"],["arm_timing","Arm timing","coordination"],
  ["trunk_stability","Trunk stability","mechanical"],["coordination","Coordination","coordination"],
  ["relaxation","Relaxation","coordination"],["symmetry","Symmetry","mechanical"],
  ["acceleration_mechanics","Acceleration mechanics","phase"],["maximum_velocity_mechanics","Maximum velocity mechanics","phase"],
  ["transition_mechanics","Transition mechanics","phase"],["deceleration_control","Deceleration control","phase"],
  ["unknown","Unknown","unknown"],
].map(([key,label,scope])=>({key:key as LimiterKey,label,scope:scope as "mechanical"|"coordination"|"phase"|"unknown",nonClinical:true as const,version:ROOT_CAUSE_TAXONOMY_VERSION}));
