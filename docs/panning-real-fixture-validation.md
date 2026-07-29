# Real panning Timing Workspace validation

Validation date: 2026-07-17  
Fixture: `IMG_6371 2.mov` / session `2f1c901b-a5e2-4682-9049-1aa1fe8e89fb`

## Outcome

The mechanics rerun completed, the professional workspace has a reviewed physical-line
draft, and automatic marked-zone timing is **safely withheld**. This fixture does not
validate automatic panning timing.

## Lifecycle evidence

- Reset archived invalid working analysis `fbeb8169-4294-4ed7-b1bf-28b06f55f312`,
  retained its `invalid_gate_propagation` status and downstream exclusions, cleared
  calibration/timing/workspace drafts, and preserved saved/archived rows.
- The database source pointer survived, but forensic storage verification found the local
  private object missing. The protected `/tmp` engineering copy was checked as HEVC,
  1280×720, 197 frames, CFR 30, 6.566667 seconds before being restored to the exact private
  source path. No repository copy was created.
- Full reset created working analysis `e765a215-7862-4cfe-a8f3-f5add12debbc`. Subsequent
  retries reused that exact identity and job `571ec215-2351-407d-844e-f822615835c9`.
- A generated-column incompatibility in the rerun RPC was fixed by migration 0035.
- MediaPipe produced 197 frames and stored the pose artifact under the current analysis
  path. Detected source evidence was 30/30/29.999998/30.000300 FPS
  (average/nominal/real/timestamp), CFR, classified `experimental_30_fps_class`.

## Clean state and physical references

The fresh analysis snapshot remained `technique_only` with no gates or calibration.
Therefore its completed experimental result contains no zone time or fabricated spatial
metric. The workspace draft was then populated separately from engineering manual review:

- Start: visible white tape, manually confirmed at frame 84.
- Finish: painted transverse finish line, manually confirmed at frame 170.
- Distance: 30 m, user-asserted only.
- Body reference: torso at both boundaries.
- Automatic candidates: none.
- Yellow cones: excluded and not represented as gate evidence.

Draft state is reversible UI evidence only. It was not published into authoritative
calibration and did not trigger a timing calculation.

## Tracking review

The fresh pose artifact was used with `ava-local-gate-tracker-v1`.

| Gate | Review result | Error evidence | Readiness |
| --- | --- | --- | --- |
| White-tape start | Locked for 4/5 annotated frames, Limited at frame 84 | mean midpoint 3.93 px; max 7.58 px; max angular 1.64° | Limited |
| Painted finish | Limited for 5/5 annotated frames | mean midpoint 1.23 px; max 2.52 px; max angular 0.32° | Limited |

The finish identity is spatially stable but never crosses the tracker’s lock threshold.
The start loses full lock at the final reviewed physical-line keyframe. Neither satisfies
the requirement for stable local lock around a reviewed crossing bracket.

## Timing decision

- Raw automatic time: withheld.
- Conservative automatic time: withheld.
- Uncertainty: not computed because no trustworthy crossing pair exists.
- External 2.77-second reference: remains partially compatible context only.
- Prior 2.243879-second result: remains invalid, archived, and excluded.
- Manual fallback: the workspace supports source-frame before/after brackets and
  interpolation, but no new brackets were asserted in this pass. A manual result was not
  invented merely to approach 2.77 seconds.

## Narrow blockers fixed

1. Reset now clears the reversible `timing_workspace` draft.
2. Working reruns no longer assign to generated experimental timing columns.
3. Experimental technique-only analysis now completes without physical gates and withholds
   zone timing instead of failing the whole mechanics job.
4. Workspace gate confirmation now records manual physical-line provenance separately from
   unavailable automatic candidates.

## Completion assessment

Panning timing validation is approximately **72%**: source/pose/camera evidence, physical
line review, safe withholding, and manual fallback UI exist; automatic local lock at both
crossings and a human-confirmed manual bracket pass remain.

Overall MVP remains **88%**. UI completion alone does not raise the production estimate.
