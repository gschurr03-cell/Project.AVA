# Phase 6.2B — Real Browser Playback Validation and Phase 6.2 Closure

**Date:** 2026-08-07  
**Status:** CLOSED  
**Roadmap:** 29.5% (unchanged; Phase 6.2 is unweighted)

## 1. Executive summary

Phase 6.2 is **CLOSED**. The actual authenticated session player was exercised
in Chromium for all four benchmarks. Fresh load, play, pause/resume,
forward/backward seek, 0.25×/0.5×/1×, resize, fullscreen enter/exit, and Auto
Follow OFF/ON passed. Gates stayed attached to the scene; start/finish gates and
zones stayed coherent; skeleton/contact/step rendering introduced no competing
clock. No production rendering or scientific algorithm was changed.

## 2. Prior blocker

Installed browsers could not decode/reach metadata for the original MOV/HEVC
clips. Existing documented H.264 copies made only for browser presentation
cleared that codec blocker without becoming scientific inputs.

## 3. Browser-validation architecture

`scripts/phase-6-2b-browser-gate-validation.mjs` logs into the real app, opens
the real `/sessions/:id` route, and range-serves the test MP4 into the existing
player. It does not mount a substitute renderer. The opt-in playback diagnostic
now records the gate endpoints, global-to-frame matrix, hold state, and camera
path state already selected by `VideoOverlay`; it is disabled by default.

Runtime: Playwright Chromium / Chrome for Testing 149.0.7827.55, headless macOS
arm64, DPR 2. Captures are in `tmp/phase62b/browser/`; aggregate evidence is
`tmp/phase62b/gate-trace-summary.json`.

## 4. Test media provenance

| Benchmark | Scientific source SHA-256 | Browser validation copy SHA-256 |
|---|---|---|
| Gav | `f8807192697c1e37d8c2c414307a84a81f197af660f41d4d7db76701bb57d56f` | `1209952561f7884a085063567beaf34e3dc57944dabb267a2d8f04cd668a1988` |
| Vanni 240 | `954678f64fe9620d2966cccfc5f5b1aecc69a923810beceb6fad2f24e19ed8aa` | `28feda5a2fca17ae8e82b64af308f18e44a502af15b6c2e1e8b9a8c74c61b897` |
| Vanni 120 | `de4677bb8ffccc9906f12dfce380dcf40fc78333477864b55468a566d3c35fc1` | `827c8328d1f3e43e49c8a65f08fdd0e502b066213c0e9cd259e345589f56042a` |
| Vanni 60 | `ff61af9a638ec5c36ba1c42ff778ea9119d605c9b3692ec629c800f992bc2111` | `79c25c39a76b3cff17a38118035c7c7a7be7bf78470c1478c230ae06dbd4242d` |

All are 1920×1080 with zero origin. Gav preserves 142 frames/2.366667 s.
The high-speed copies preserve the established analyzed browser timelines:
V240 1020/4.255 s, V120 483/4.025 s, V60 233/3.883333 s, with documented
mapping to source timestamps. Copies are **BROWSER VALIDATION COPY** inputs only.
The original MOV and artifacts remain the **SCIENTIFIC SOURCE**.

## 5. Gate stability measurements

Consecutive unique 1× frames, source pixels:

| Benchmark | frames | midpoint p50/p95/max | max endpoint p50/p95/max | raw residual p50/p95/max | held/rejected |
|---|---:|---:|---:|---:|---:|
| Gav | 48 | start 0/.218/.236; finish 0/.523/.567 | 0/.532/.576 | .304/.532/.576 | 42/0 |
| Vanni 240 | 33 | start 0/0/.539; finish 0/0/.427 | 0/0/.551 | .175/.361/.551 | 32/0 |
| Vanni 120 | 32 | 0/0/0 | 0/0/0 | .053/.089/.113 | 32/0 |
| Vanni 60 | 44 | 0/0/0 | 0/0/0 | .318/.382/.406 | 44/0 |

All captures had zero gate/pose source-frame mismatches and zero stale rejected
paints. Length ranges were 36.870–36.953/38.466–38.552 px (Gav),
69.599–69.615/72.029–72.046 (V240), and constant for V120/V60. Maximum
angular spans were .034°, .021°, 0°, and 0°.

## 6. Camera-shake validation

Previously measured translation, vertical shake, small rotation, and tripod/wind
motion entered the global camera path. The shared 0.5-source-pixel decision held
sub-threshold scene noise atomically. No meaningful unresolved bobbing appeared.

## 7. Pan/movement validation

Gav and V240 produced accepted movements above the deadzone while gate rigidity
remained coherent. This is correct world motion, not screen-fixed bobbing. Held
movement is sub-deadzone noise. No closure-blocking motion was found.

## 8. Pause/resume

All four paused and resumed successfully. Paused paints retained the selected
frame; resume continued from presented-frame metadata without catch-up or
detachment.

## 9. Scrubbing

Each session sought 0.25 → 1.75 → 0.75 → 2.10 s. The settled target used its
correct gate/pose frame, with no stale paint, lag, or post-seek snap. Large
between-seek changes are intentional time discontinuities.

## 10. Playback rates

All four played at 0.25×, 0.5×, and 1×. Matched source-frame geometry versus 1×
differed by at most .435 px (Gav), .480 px (V240), and 0 px (V120/V60), bounded
by the shared deadzone/history. Geometry depends on source time, not wall time.

## 11. Resize/fullscreen

All sessions were resized to 1100×760 and 1600×1050 at DPR 2. Fullscreen API
entry and exit succeeded on all four. Source geometry remained unchanged.

## 12. Zone coherence

Green pre-zone, blue measurement zone, and red post-zone retained the same
start/finish boundaries during playback, pause, seek, resize, fullscreen, and
camera movement. No independent endpoint or polygon smoothing appeared.

## 13. Auto Follow coexistence

Separate live 1× Auto Follow captures passed for every benchmark. The shared
presentation transform moved video, gates, and zones together and did not feed
back into scientific geometry.

## 14. Skeleton coexistence

Skeleton, contacts, steps, gates, and zones rendered together. Phase 6.6B pose
selection and gate geometry used the same source frame (zero mismatches).

## 15. Scientific regression

No scientific source changed. Current accepted post-Phase-7.3B values remain:

| Gav | Vanni 240 | Vanni 120 | Vanni 60 |
|---:|---:|---:|---:|
| 4.848484848484849 Hz | 3.6206896551724137 Hz | 4.655172413793103 Hz | 4.385953327434329 Hz |

Phase 7.3B replay reproduced current contact identities: only R443, L178, and
L227 are the intended recoveries; V240 R200 remains rejected. Historical
pre-7.3B V240/V120 values in the original report are not current targets.

## 16. Test results

Passed: Phase 6.1 (13), 6.2 (23), 6.3 (16), 6.4 (20), 6.5 (26), 6.6B Part A
(5), 6.6B Part B (18), 6.6C (13), 7.0 (26), 7.1 (24), 7.2 (24), 7.2B (24),
7.3B (11), timing verification, analysis report, typecheck, lint, and production
build (41/41 pages).

## 17. Acceptance table

| Requirement | Result |
|---|---|
| World lock/shake; coherent start, finish, zones | Pass |
| Pause/resume; forward/backward scrub | Pass |
| 0.25×/0.5×/1×; resize; fullscreen | Pass |
| Auto Follow and skeleton coexistence | Pass |
| Zero scientific changes; required regressions | Pass |

## 18. Phase 6.2 closure decision

All closure criteria pass. Phase 6.2 is **CLOSED**. No algorithm fix was needed.

## 19. Roadmap status

Phase 6.2 is unweighted. Overall weighted completion remains **29.5%**. No
roadmap item remains in progress from this browser blocker.

## 20. Remaining limitations

- Chromium did not decode original MOV/HEVC; source-derived H.264 copies were
  used only for presentation testing.
- A 60 Hz display cannot present every 120/240 fps source frame.
- Partial affine remains unvalidated for strong dolly/perspective motion.
- Safari, Firefox, mobile hardware, and physical external monitors were not tested.

## 21. Git status and agent handoff

**Prior architecture inherited:** global camera path, atomic 0.5 px deadzone,
science/display separation, Phase 6.1 clock, Phase 6.3/6.6C zones, Phase 6.5
presentation transform, and Phase 6.6B scheduler.

**Prior findings independently verified:** stationary uses real background
motion, does not mean zero motion, and gates/zones stabilize atomically outside
science; the 23 Phase 6.2 tests were rerun.

**Findings corrected:** the codec issue is no longer a blocker through the
established test-media path; pre-7.3B V240/V120 numbers are historical.

**Code changed here:** opt-in `VideoOverlay.tsx` gate diagnostics plus
`phase-6-2b-browser-gate-validation.mjs` and
`phase-6-2b-gate-trace-summary.mjs`. Production behavior is unchanged.

**Tests added here:** the actual-browser capture and quantitative summary above.

**Real runs performed here:** all four authenticated browser sessions and every
interaction above; current contact regressions and the complete listed suite.

**Not personally validated:** original MOV/HEVC decoding, fresh scientific
analysis from video, or database persistence. Scientific artifacts/contracts
were tested read-only. No database mutation occurred.

The worktree was already substantially dirty; unrelated work was preserved. No
commit, push, database reset, or database mutation was performed.
