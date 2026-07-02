import type { MetricStatus } from "../types";

export interface MetricThresholdBand {
  status: MetricStatus;
  min: number;
  max: number;
  meaning: string;
}

export interface MetricThreshold {
  id: string;
  label: string;
  unit: string;
  targetRange: string;
  bands: MetricThresholdBand[];
  usedIn: string[];
}

export const METRIC_THRESHOLDS: Record<string, MetricThreshold> = {
  stepFrequency: {
    id: "stepFrequency",
    label: "Step Frequency",
    unit: "Hz",
    targetRange: "4.8–5.2 Hz",
    usedIn: ["Technique Score", "Stride Pattern", "Fatigue Analysis"],
    bands: [
      { status: "elite", min: 4.8, max: 5.2, meaning: "Excellent turnover for high-level sprinting." },
      { status: "good", min: 4.5, max: 4.79, meaning: "Solid turnover with room to improve at maximum velocity." },
      { status: "watch", min: 4.2, max: 4.49, meaning: "Turnover may be limiting sprint velocity." },
      { status: "poor", min: 0, max: 4.19, meaning: "Step frequency is well below sprint target range." },
    ],
  },

  groundContactTime: {
    id: "groundContactTime",
    label: "Ground Contact Time",
    unit: "ms",
    targetRange: "75–95 ms",
    usedIn: ["Technique Score", "Ground Contact", "Stiffness Analysis"],
    bands: [
      { status: "elite", min: 75, max: 95, meaning: "Excellent stiffness and force application during support." },
      { status: "good", min: 96, max: 110, meaning: "Good ground contact with slight room to improve stiffness." },
      { status: "watch", min: 111, max: 125, meaning: "Ground contact may be too long for high-speed sprinting." },
      { status: "poor", min: 126, max: 999, meaning: "Ground contact is likely limiting sprint velocity." },
    ],
  },

  flightTime: {
    id: "flightTime",
    label: "Flight Time",
    unit: "ms",
    targetRange: "100–140 ms",
    usedIn: ["Stride Pattern", "Elasticity", "Fatigue Analysis"],
    bands: [
      { status: "elite", min: 100, max: 140, meaning: "Strong flight phase for sprinting." },
      { status: "good", min: 90, max: 150, meaning: "Acceptable flight time for sprinting." },
      { status: "watch", min: 70, max: 170, meaning: "Flight time may indicate stride rhythm issues." },
      { status: "poor", min: 0, max: 999, meaning: "Flight time is outside expected sprint range." },
    ],
  },

  strideLength: {
    id: "strideLength",
    label: "Stride Length",
    unit: "m",
    targetRange: "2.35–2.65 m",
    usedIn: ["Technique Score", "Stride Pattern", "Max Velocity"],
    bands: [
      { status: "elite", min: 2.45, max: 2.75, meaning: "Excellent stride length for high-level sprinting." },
      { status: "good", min: 2.25, max: 2.44, meaning: "Good stride length with room to improve projection." },
      { status: "watch", min: 2.0, max: 2.24, meaning: "Stride length may be limiting velocity." },
      { status: "poor", min: 0, max: 1.99, meaning: "Stride length is well below sprint target range." },
    ],
  },
};
