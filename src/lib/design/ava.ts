export type AvaMetricStatus =
  | "excellent"
  | "good"
  | "moderate"
  | "poor"
  | "missing";

export const AVA = {
  bg: "#081019",
  surface: "#101827",
  card: "#182233",
  cardHover: "#223047",
  red: "#2F80ED",
  redGlow: "rgba(47, 128, 237, 0.0)",
  text: "#F5F7FB",
  muted: "#B3BCCB",
  faint: "#7E8797",
  divider: "rgba(255,255,255,0.08)",

  /**
   * Performance scale — a clean green/blue/amber/red band (WHOOP/Garmin-style),
   * replacing the medal metaphor. Colors + labels only; no metric math changes.
   */
  status: {
    excellent: {
      label: "Elite",
      tier: "Elite",
      color: "#89D46A",
    },
    good: {
      label: "Strong",
      tier: "Strong",
      color: "#2F80ED",
    },
    moderate: {
      label: "Fair",
      tier: "Fair",
      color: "#F5C451",
    },
    poor: {
      label: "Low",
      tier: "Low",
      color: "#E46464",
    },
    missing: {
      label: "No Data",
      tier: "No Data",
      color: "#7E8797",
    },
  },
} as const;

export function getAvaStatus(status: AvaMetricStatus) {
  return AVA.status[status];
}

/**
 * Semantic badge/pill tones for the dark theme. `good`/`warn`/`alert` carry the
 * performance-scale meaning; `brand` is AVA blue for identity accents only (never
 * "bad performance"). Returns translucent classes that read on dark surfaces.
 * (Legacy medal names kept as aliases so existing call sites stay valid.)
 */
export type AvaTone = "gold" | "silver" | "bronze" | "gray" | "alert" | "brand" | "good" | "warn";

export const AVA_BADGE: Record<AvaTone, string> = {
  // Legacy medal aliases mapped onto the performance scale.
  gold: "border-[#89D46A]/40 bg-[#89D46A]/12 text-[#89D46A]",
  silver: "border-[#2F80ED]/40 bg-[#2F80ED]/12 text-[#3B8EFF]",
  bronze: "border-[#F5C451]/45 bg-[#F5C451]/12 text-[#F5C451]",
  good: "border-[#89D46A]/40 bg-[#89D46A]/12 text-[#89D46A]",
  warn: "border-[#F5C451]/45 bg-[#F5C451]/12 text-[#F5C451]",
  gray: "border-white/10 bg-white/[0.05] text-[#B3BCCB]",
  alert: "border-[#E46464]/40 bg-[#E46464]/12 text-[#E46464]",
  brand: "border-[#2F80ED]/45 bg-[#2F80ED]/14 text-[#3B8EFF]",
};

/** Inline badge className for a tone (uppercase pill). */
export function avaBadge(tone: AvaTone): string {
  return `rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${AVA_BADGE[tone]}`;
}

/** Shared dark surface class strings so every child panel reads as one system. */
export const AVA_SURFACE = {
  /** Standard surface card. */
  card: "rounded-xl border border-white/[0.08] bg-[#182233] p-4",
  /** Recessed inner surface (replaces the old bg-gray-50 blocks). */
  inset: "rounded-lg border border-white/[0.06] bg-white/[0.03] p-3",
  textPrimary: "text-[#F5F7FB]",
  textSecondary: "text-[#B3BCCB]",
  textFaint: "text-[#7E8797]",
  label: "text-xs font-semibold uppercase tracking-wide text-[#7E8797]",
} as const;

export function getAvaStatusStyle(status: AvaMetricStatus) {
  const item = getAvaStatus(status);

  return {
    color: item.color,
    borderColor: `${item.color}66`,
    backgroundColor: `${item.color}14`,
    boxShadow: `0 0 0 1px ${item.color}22`,
  };
}
