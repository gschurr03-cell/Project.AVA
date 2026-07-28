import { stableFingerprint } from "../shared/fingerprint";
export type IntelligenceReadMode =
  | "LEGACY_ONLY" | "SHADOW_MANIFEST" | "MANIFEST_PREFERRED"
  | "MANIFEST_REQUIRED" | "MANIFEST_ONLY";
export interface SnapshotReadClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}
export interface ActivatedSnapshotEnvelope {
  manifestId: string;
  engineId: string;
  engineVersion: string;
  adapterVersion: string;
  snapshotId: string;
  outputFingerprint: string;
  payload: unknown;
}
export interface ManifestMismatch {
  engineId: string;
  legacyFingerprint: string | null;
  manifestFingerprint: string | null;
  reason: string;
}
export async function resolveActivatedIntelligenceSnapshot(input: {
  client: SnapshotReadClient;
  athleteId: string;
  engineId: string;
  mode: IntelligenceReadMode;
  readLegacy: () => Promise<unknown | null>;
  onMismatch?: (mismatch: ManifestMismatch) => void | Promise<void>;
}): Promise<unknown | null> {
  if (input.mode === "LEGACY_ONLY") return input.readLegacy();
  const { data, error } = await input.client.rpc("get_activated_intelligence_snapshot", {
    p_athlete_id: input.athleteId, p_engine_id: input.engineId,
  });
  const envelope = !error && data && typeof data === "object" ? data as ActivatedSnapshotEnvelope : null;
  if (input.mode === "MANIFEST_REQUIRED" || input.mode === "MANIFEST_ONLY") {
    if (!envelope) throw new Error(`Active manifest snapshot unavailable for ${input.engineId}`);
    return envelope.payload;
  }
  const legacy = await input.readLegacy();
  if (input.mode === "SHADOW_MANIFEST") {
    if (envelope) {
      const legacyFingerprint = legacy == null ? null : stableFingerprint(legacy);
      if (legacyFingerprint !== envelope.outputFingerprint)
        await input.onMismatch?.({
          engineId: input.engineId, legacyFingerprint,
          manifestFingerprint: envelope.outputFingerprint, reason: "deterministic_fingerprint_mismatch",
        });
    }
    return legacy;
  }
  return envelope?.payload ?? legacy;
}

