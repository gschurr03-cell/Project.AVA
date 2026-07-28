export type BaselineResolutionMode = "legacy_pointer" | "active_manifest" | "manifest_preferred";
export interface AuthoritativeBaseline {
  resolutionMode: BaselineResolutionMode;
  snapshotId: string | null; snapshotType: string; engineId: string;
  engineVersion: string | null; contractVersion: string | null;
  deterministicFingerprint: string | null; createdAt: string | null;
  activatedAt: string | null; sourceManifestId: string | null; payload: unknown;
}
export interface BaselineSource {
  readLegacy(engineId: string): Promise<AuthoritativeBaseline | null>;
  readManifest(engineId: string): Promise<AuthoritativeBaseline | null>;
}
export class AuthoritativeBaselineResolver {
  constructor(private readonly source: BaselineSource) {}
  async resolve(engineId: string, mode: BaselineResolutionMode): Promise<AuthoritativeBaseline | null> {
    if (mode === "legacy_pointer") return this.source.readLegacy(engineId);
    if (mode === "active_manifest") return this.source.readManifest(engineId);
    return (await this.source.readManifest(engineId)) ?? this.source.readLegacy(engineId);
  }
}

