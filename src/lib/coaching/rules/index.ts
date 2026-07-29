import type { CoachingRule } from "../types";
import { eliteContactRule } from "./contact";
import { cadenceStrideRule, strideLimiterRule } from "./stride";

export const COACHING_RULES: CoachingRule[] = [
  eliteContactRule,
  strideLimiterRule,
  cadenceStrideRule,
];