export type PlaybackSyncIdentity = {
  sessionId: string | null;
  analysisId: string | null;
  sourceVideo: string;
  sourceFps: number | null;
  sourceFpsClassification: string | null;
};

export type PlaybackSyncRecord = Record<string, unknown> & {
  kind: "effect" | "video_event" | "rvfc_registration" | "rvfc_callback" | "raf_loop" | "paint"
    | "presentation_candidate" | "presentation_promotion" | "presentation_invalidation";
  recordedAtPerformanceMs: number;
  identity: PlaybackSyncIdentity;
  effectId: number;
};

export type PlaybackSyncTrace = {
  schemaVersion: "ava-playback-sync-debug-v1";
  createdAt: string;
  records: PlaybackSyncRecord[];
};

type DebugWindow = Window & {
  __AVA_PLAYBACK_SYNC_DEBUG__?: {
    trace: PlaybackSyncTrace;
    clear: () => void;
    download: (filename?: string) => void;
  };
};

let nextDebugId = 1;

export function nextPlaybackSyncDebugId(): number {
  const id = nextDebugId;
  nextDebugId += 1;
  return id;
}

/** DEV-only and opt-in. Production builds cannot enable this collector. */
export function playbackSyncDebugEnabled(): boolean {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("avaPlaybackSyncDebug") === "1";
}

function globalTrace(): PlaybackSyncTrace {
  const debugWindow = window as DebugWindow;
  if (debugWindow.__AVA_PLAYBACK_SYNC_DEBUG__) return debugWindow.__AVA_PLAYBACK_SYNC_DEBUG__.trace;

  const trace: PlaybackSyncTrace = {
    schemaVersion: "ava-playback-sync-debug-v1",
    createdAt: new Date().toISOString(),
    records: [],
  };
  const clear = () => { trace.records.length = 0; };
  const download = (filename = `ava-playback-sync-${Date.now()}.json`) => {
    const blob = new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(href);
  };
  debugWindow.__AVA_PLAYBACK_SYNC_DEBUG__ = { trace, clear, download };
  return trace;
}

export type PlaybackSyncRecorder = {
  enabled: true;
  effectId: number;
  record: (record: { kind: PlaybackSyncRecord["kind"]; [key: string]: unknown }) => void;
};

export function createPlaybackSyncRecorder(
  identity: PlaybackSyncIdentity,
  effectId: number,
): PlaybackSyncRecorder | null {
  if (!playbackSyncDebugEnabled()) return null;
  const trace = globalTrace();
  return {
    enabled: true,
    effectId,
    record: (record) => {
      trace.records.push({
        ...record,
        recordedAtPerformanceMs: performance.now(),
        identity,
        effectId,
      });
    },
  };
}
