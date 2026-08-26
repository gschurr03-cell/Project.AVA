export type OverlayPresentationCandidate<T> = {
  generation: number;
  mediaTimeS: number;
  expectedDisplayTimeMs: number;
  presentedFrames: number | null;
  payload: T;
};

/**
 * Real Chromium traces resolve scheduling in 0.1 ms increments while the
 * smallest measured AVA canvas submission took 0.2 ms. Submitting at most
 * 0.5 ms before the metadata boundary therefore completes at the boundary and
 * avoids missing the entire refresh when rAF's timestamp is fractionally early.
 */
export const OVERLAY_PRESENTATION_SUBMISSION_LEAD_MS = 0.5;

export type OverlayPresentationState<T> = {
  generation: number;
  displayed: OverlayPresentationCandidate<T> | null;
  ready: OverlayPresentationCandidate<T> | null;
  pending: OverlayPresentationCandidate<T> | null;
};

export function createOverlayPresentationState<T>(
  displayed: OverlayPresentationCandidate<T> | null = null,
): OverlayPresentationState<T> {
  return { generation: displayed?.generation ?? 0, displayed, ready: null, pending: null };
}

/**
 * Invalidates decoded-frame work that belongs to a prior seek/source/rate
 * lifecycle. The currently visible overlay is retained until a new frame is
 * authoritative, so invalidation itself never flashes or advances the pose.
 */
export function invalidateOverlayPresentation<T>(
  state: OverlayPresentationState<T>,
): OverlayPresentationState<T> {
  return { generation: state.generation + 1, displayed: state.displayed, ready: null, pending: null };
}

/**
 * Stores only the newest callback candidate. This deliberately cannot build a
 * queue when source frames (notably 240 fps media) outnumber display refreshes.
 */
export function enqueueOverlayPresentation<T>(
  state: OverlayPresentationState<T>,
  candidate: OverlayPresentationCandidate<T>,
  observedNowMs = Number.NEGATIVE_INFINITY,
): OverlayPresentationState<T> {
  if (candidate.generation !== state.generation) return state;
  const pending = state.pending;
  const ready = pending && pending.expectedDisplayTimeMs <= observedNowMs
    ? pending
    : state.ready;
  if (pending) {
    const candidateOrder = candidate.presentedFrames ?? candidate.mediaTimeS;
    const pendingOrder = pending.presentedFrames ?? pending.mediaTimeS;
    if (candidateOrder < pendingOrder) return { ...state, ready };
  }
  return { ...state, ready, pending: candidate };
}

export type OverlayPresentationPromotion<T> = {
  state: OverlayPresentationState<T>;
  promoted: OverlayPresentationCandidate<T> | null;
};

/**
 * Advances the visible overlay only on the first rAF opportunity at or after
 * the decoded frame's metadata-defined presentation boundary. There is no
 * guessed delay and no playback-rate-specific timing constant.
 */
export function promoteOverlayPresentation<T>(
  state: OverlayPresentationState<T>,
  animationFrameTimeMs: number,
  submissionLeadMs = 0,
): OverlayPresentationPromotion<T> {
  const pending = state.pending;
  const pendingEligible = pending?.generation === state.generation
    && animationFrameTimeMs + submissionLeadMs >= pending.expectedDisplayTimeMs;
  const promoted = pendingEligible ? pending : state.ready;
  if (!promoted || promoted.generation !== state.generation) {
    return { state, promoted: null };
  }
  if (animationFrameTimeMs + submissionLeadMs < promoted.expectedDisplayTimeMs) {
    return { state, promoted: null };
  }
  return {
    state: {
      ...state,
      displayed: promoted,
      ready: null,
      pending: pendingEligible ? null : pending,
    },
    promoted,
  };
}
