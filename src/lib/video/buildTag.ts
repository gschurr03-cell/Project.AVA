/**
 * A literal, hand-bumped marker (NOT a git hash — local edits here are
 * deliberately uncommitted, so `git rev-parse HEAD` would stay frozen across
 * every change in this session and prove nothing). Both `[world-lock-runtime]`
 * emitters (VideoOverlay.tsx, TimingWorkspace.tsx) import this one constant so
 * their logs are directly comparable, and so the running bundle's freshness can
 * be independently verified — grep the served JS chunk for this exact string —
 * instead of assumed. Bump it whenever either emitter's logic changes.
 */
export const WORLD_LOCK_BUILD_TAG = "wlr-2026-07-30-a";
