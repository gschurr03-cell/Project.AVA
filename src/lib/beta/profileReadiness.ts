export type ProfileReadinessStatus =
  | "missing_required"
  | "analysis_ready"
  | "partially_individualized"
  | "fully_individualized";

export type AthleteProfileReadiness = {
  status: ProfileReadinessStatus;
  completionPercent: number;
  requiredMissing: string[];
  recommendedMissing: string[];
  affectedFeatures: string[];
};

type Profile = {
  full_name?: string | null;
  height_cm?: number | null;
  leg_length_cm?: number | null;
  trochanter_height_m?: number | null;
  sex?: string | null;
  personal_best_60m?: number | null;
  personal_best_100m?: number | null;
  personal_best_200m?: number | null;
};

export function assessProfileReadiness(profile: Profile): AthleteProfileReadiness {
  const requiredMissing = !profile.full_name?.trim() ? ["full_name"] : [];
  const recommendedMissing: string[] = [];
  if (!profile.height_cm) recommendedMissing.push("height");
  if (!profile.leg_length_cm && !profile.trochanter_height_m) recommendedMissing.push("leg_length");
  if (!profile.sex) recommendedMissing.push("sex");
  if (![profile.personal_best_60m, profile.personal_best_100m, profile.personal_best_200m].some(Boolean))
    recommendedMissing.push("personal_best");

  const completed = 1 + (4 - recommendedMissing.length);
  const completionPercent = Math.round((completed / 5) * 100);
  const status: ProfileReadinessStatus = requiredMissing.length
    ? "missing_required"
    : recommendedMissing.length === 0
      ? "fully_individualized"
      : recommendedMissing.length <= 2
        ? "partially_individualized"
        : "analysis_ready";
  const affectedFeatures = [
    ...(!profile.height_cm ? ["Body-size context is unavailable."] : []),
    ...(!profile.leg_length_cm && !profile.trochanter_height_m
      ? ["Step-length comparisons cannot be fully individualized."]
      : []),
    ...(!profile.sex ? ["Population comparisons may be limited or withheld."] : []),
    ...(![profile.personal_best_60m, profile.personal_best_100m, profile.personal_best_200m].some(Boolean)
      ? ["Historical performance context is unavailable."]
      : []),
  ];
  return { status, completionPercent, requiredMissing, recommendedMissing, affectedFeatures };
}

