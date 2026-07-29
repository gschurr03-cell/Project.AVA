import "server-only";
import { FEATURES } from "@/lib/config/features";
import { resolveActivatedIntelligenceSnapshot, type SnapshotReadClient } from "./snapshotResolver";

export async function readActivatedOrLegacySnapshot(input: {
  client: SnapshotReadClient;
  athleteId: string;
  engineId: string;
  readLegacy: () => Promise<unknown | null>;
}) {
  return resolveActivatedIntelligenceSnapshot({
    ...input,
    mode: FEATURES.intelligenceOrchestrationReadMode,
    onMismatch: (mismatch) => {
      // Structured and PII-free. A production telemetry sink can replace this callback.
      console.warn(JSON.stringify({ event: "legacy_manifest_mismatch", ...mismatch }));
    },
  });
}

