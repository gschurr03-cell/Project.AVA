/**
 * Sprint Intelligence model version. Stamped onto every generated report so historical
 * results retain the ruleset that produced them and reports can be recalculated deliberately.
 *
 * Bump the MINOR when reasoning/wording rules change in a way that alters output; bump MAJOR
 * for a breaking change to the report shape. Never silently overwrite a persisted report with
 * a different version — a rerun must be explicit.
 */
export const SPRINT_INTELLIGENCE_VERSION = "sprint-intelligence-1.0.0";
