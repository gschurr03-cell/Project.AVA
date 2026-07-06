export type AvaMetricStatus =
  | "excellent"
  | "good"
  | "moderate"
  | "poor"
  | "missing";

export const AVA = {
  bg: "#090909",
  surface: "#121214",
  card: "#19191C",
  cardHover: "#202024",
  red: "#D72638",
  redGlow: "rgba(215, 38, 56, 0.28)",
  text: "#F5F5F7",
  muted: "#A0A2A8",
  faint: "#6B7280",
  divider: "rgba(255,255,255,0.06)",

  status: {
    excellent: {
      label: "Excellent",
      tier: "Gold",
      color: "#D4AF37",
    },
    good: {
      label: "Good",
      tier: "Silver",
      color: "#C0C0C0",
    },
    moderate: {
      label: "Moderate",
      tier: "Bronze",
      color: "#CD7F32",
    },
    poor: {
      label: "Red Alert",
      tier: "Alert",
      color: "#FF3B30",
    },
    missing: {
      label: "Missing",
      tier: "No Data",
      color: "#6B7280",
    },
  },
} as const;

export function getAvaStatus(status: AvaMetricStatus) {
  return AVA.status[status];
}

/**
 * Semantic badge/pill tones for the dark theme. Medal tones (gold/silver/bronze)
 * and `alert`/`gray` carry METRIC/STATUS meaning; `brand` is AVA red for identity
 * accents only (never "bad performance"). Returns translucent classes that read on
 * charcoal surfaces.
 */
export type AvaTone = "gold" | "silver" | "bronze" | "gray" | "alert" | "brand";

export const AVA_BADGE: Record<AvaTone, string> = {
  gold: "border-[#D4AF37]/40 bg-[#D4AF37]/12 text-[#E4C25A]",
  silver: "border-[#C0C0C0]/40 bg-[#C0C0C0]/12 text-[#D8D8DC]",
  bronze: "border-[#CD7F32]/45 bg-[#CD7F32]/12 text-[#E0A063]",
  gray: "border-white/10 bg-white/[0.05] text-[#A0A2A8]",
  alert: "border-[#FF3B30]/40 bg-[#FF3B30]/12 text-[#FF7A70]",
  brand: "border-[#D72638]/45 bg-[#D72638]/12 text-[#FF6B78]",
};

/** Inline badge className for a tone (uppercase pill). */
export function avaBadge(tone: AvaTone): string {
  return `rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${AVA_BADGE[tone]}`;
}

/** Shared dark surface class strings so every child panel reads as one system. */
export const AVA_SURFACE = {
  /** Standard charcoal card. */
  card: "rounded-xl border border-white/[0.06] bg-[#19191C] p-4",
  /** Recessed inner surface (replaces the old bg-gray-50 blocks). */
  inset: "rounded-lg border border-white/[0.06] bg-white/[0.03] p-3",
  textPrimary: "text-[#F5F5F7]",
  textSecondary: "text-[#A0A2A8]",
  textFaint: "text-[#6B7280]",
  label: "text-xs font-semibold uppercase tracking-wide text-[#6B7280]",
} as const;

export function getAvaStatusStyle(status: AvaMetricStatus) {
  const item = getAvaStatus(status);

  return {
    color: item.color,
    borderColor: `${item.color}66`,
    backgroundColor: `${item.color}14`,
    boxShadow: `0 0 24px ${item.color}22`,
  };
}
