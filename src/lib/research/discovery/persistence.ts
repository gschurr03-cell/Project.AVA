import { DISCOVERY_SNAPSHOT_VERSION, discoverySnapshotSchema, type DiscoveryResult } from "./contracts";

export function serializeDiscoverySnapshot(result: DiscoveryResult): string {
  return JSON.stringify(discoverySnapshotSchema.parse({
    snapshotVersion: DISCOVERY_SNAPSHOT_VERSION, result,
  }));
}

export function parseDiscoverySnapshot(snapshot: string): DiscoveryResult {
  return discoverySnapshotSchema.parse(JSON.parse(snapshot)).result;
}

