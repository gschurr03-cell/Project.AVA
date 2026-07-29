import type { ReportMetricKey } from "./types";

export const AUTHORITATIVE_METRIC_DEFINITIONS: Record<ReportMetricKey, {
  name: string; unit: "m" | "Hz" | "m/s"; definition: string;
}> = {
  average_step_length: {
    name: "Average Step Length", unit: "m",
    definition: "Average of all valid opposite-foot steps inside the authoritative measured zone.",
  },
  peak_step_length: {
    name: "Peak Step Length", unit: "m",
    definition: "Highest rolling average of four consecutive valid step lengths—not the single longest detected step.",
  },
  step_frequency: {
    name: "Step Frequency", unit: "Hz",
    definition: "Calculated from valid step intervals inside the authoritative timing zone.",
  },
  average_velocity: {
    name: "Average Velocity", unit: "m/s",
    definition: "Measured-zone distance divided by interpolated torso boundary-crossing time.",
  },
  peak_velocity: {
    name: "Peak Velocity", unit: "m/s",
    definition: "Fastest single valid step interval: step distance divided by step time—not a rolling average.",
  },
};
