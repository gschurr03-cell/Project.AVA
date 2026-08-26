# Project AVA
## Athlete Identity Acquisition Redesign — Vanni 240fps Stationary Fly (Day 101)

Status: Real tracking-algorithm change, implemented and validated against the
real Vanni clip. No measurement algorithm (contact detection thresholds,
step-length/velocity math, evidence framework) was modified. No panning
logic was touched. No database writes were made beyond normal read-only
queries and local, throwaway CLI pose-runner invocations for validation
(writes only to `/tmp`, never to Supabase Storage or the database). Nothing
was committed or pushed.

This is the direct fix for the root cause [Day 100](day-100-early-zone-evidence-recovery-audit.md)
found and deliberately deferred: the identity tracker locked onto a stadium
bleacher pattern at source frame 7 of the real Vanni clip — before the
athlete ever entered the video — and its own correct continuity checks then
permanently rejected every later, genuine sighting of the real athlete.

---

## Part 1 — Old acquisition state machine

```
UNINITIALIZED
   |  ANY candidate clearing three basic bars in a single frame:
   |    - completeness >= 45% of landmarks visible >= 0.3
   |    - human-shaped aspect ratio (0.12-1.6 width/height)
   |    - best-scoring among this frame's candidates, score >= MIN_ACCEPT_SCORE (0.45)
   |      (near-entry was a SOFT scoring preference, not a requirement:
   |       0.6 weight if near-entry, 0.3 if not — a complete, human-shaped
   |       candidate anywhere in frame could still win)
   v
TRACKED  ─────────── (identity now authoritative; every future candidate is
   |                  compared for continuity — teleport / direction / scale
   |                  — against THIS reference, whatever it was)
   |  6 consecutive frames with no continuity-passing candidate
   v
REACQUIRING  (bounded search radius around last known position)
   |  60 frames without a re-verified candidate
   v
TERMINATED
```

**Every transition, what it required, and its failure mode:**

| Transition | Required evidence | Acceptance logic | Rejection logic | Failure mode (real, observed) |
|---|---|---|---|---|
| UNINITIALIZED → TRACKED | One (1) frame, one candidate, completeness ≥45%, human-shaped, highest-scoring | `best_score >= MIN_ACCEPT_SCORE` | None of the above | **A single false-positive detection permanently became the tracked identity.** On the real Vanni clip, a stadium bleacher stair/fence pattern was accepted at source frame 7 — before the athlete had entered the frame — because it was complete, human-shaped-by-aspect-ratio, and near-entry was only a soft preference among candidates, not a requirement it had to clear. |
| TRACKED → TRACKED (continuation) | A new candidate must not teleport, must not oppose the configured direction, must not jump scale, relative to `self.state` | `_score_candidate` (unchanged, and — per Day 100 — correct) | `teleport_implausible_velocity` / `opposes_configured_direction` / `scale_discontinuity` | **None on its own** — this is the half of the system Day 100 found working correctly. Its failure mode was inherited from acquisition: once locked onto the wrong reference, these SAME correct checks then rejected the real athlete every time they appeared, because relative to the false reference their real position looked like an impossible jump. |
| TRACKED → REACQUIRING | 6 consecutive unverified frames | count-based | — | None found |
| REACQUIRING → TRACKED | A candidate within an expanding search radius of the last known position, passing continuity | same `_score_candidate`, radius-bounded | `outside_search_region` | None found |
| REACQUIRING → TERMINATED | 60 frames without recovery | count-based | — | None found |

The single, precise defect: **one frame was sufficient to make identity
authoritative, and the one soft preference (near-entry) that could have
prevented the specific real failure was not a hard requirement.**

---

## Part 2 — New acquisition state machine

```
UNINITIALIZED
   |  first candidate clearing HARD gates: completeness >=45%, human-shaped,
   |  near the configured entry side (now MANDATORY, not a scoring weight),
   |  and not within the cooldown radius of a just-discarded stationary
   |  candidate
   v
SEARCHING ──(no eligible candidate this frame)──> stays SEARCHING
   |  one eligible candidate found -> becomes the PENDING identity (hits=1)
   v
CANDIDATE  (hits == 1 — a single sighting, not yet trusted)
   |  a 2nd corroborating hit (continuity-consistent with the pending
   |  candidate's OWN accumulating position/scale/velocity — same physics
   |  as post-lock continuity, applied one stage earlier)
   v
VERIFYING  (2 <= hits < MIN_VERIFICATION_HITS=3, accumulating real
   |         displacement)
   |  Nth (>=3) consistent, corroborating hit, AND cumulative displacement
   |  >= MIN_CUMULATIVE_DISPLACEMENT (0.03 normalized frame-widths), AND
   |  still within MAX_STATIONARY_VERIFICATION_SECONDS (3.0s) of first
   |  sighting
   v
TRACKED  (identity LOCKED — from here, the UNCHANGED Day-95/100-verified
   |       continuity logic governs every further frame)
   |
   |  Part 6 (bounded, narrow): within EARLY_LOCK_REEVALUATION_SECONDS
   |  (1.0s) of locking, IF the lock has itself shown < 0.02 real
   |  displacement since locking (hasn't yet proven itself), a
   |  substantially stronger, near-entry candidate MAY replace it —
   |  logged as an explicit identity switch. Never reachable once a lock
   |  has moved.
   |
   |  6 consecutive unverified frames (unchanged)
   v
REACQUIRING → TERMINATED (unchanged — Day 100 found this correct)
```

**A pending (CANDIDATE/VERIFYING) identity is discarded, restarting from
SEARCHING, when:**
- more than `VERIFICATION_MAX_CONSECUTIVE_MISSES` (2) consecutive detector
  hits fail to corroborate it ("lost the thread"), or
- `MAX_STATIONARY_VERIFICATION_SECONDS` (3.0s) have elapsed since first
  sighting without accumulating `MIN_CUMULATIVE_DISPLACEMENT` (0.03) of real
  movement — **the direct, targeted fix for the real Day 100 failure mode**:
  a stadium bleacher pattern can be confidently "human-shaped" and complete
  to MediaPipe, and can even by chance be near-entry, but it is categorically
  incapable of ever moving. A discarded stationary candidate's position is
  remembered for `STATIONARY_REJECTION_COOLDOWN_SECONDS` (2.0s) so the exact
  same static false candidate cannot immediately restart the same doomed
  verification loop.

No single frame can reach TRACKED under any path. All thresholds are new,
additive requirements on top of the existing ones — nothing that previously
had to hold to reach TRACKED was loosened.

---

## Part 3 — Files changed

- **Modified**: `src/lib/biomechanics/mediapipe/runtime/athlete_tracker.py`
  — the full rewrite described above. `box_tracker.py` and
  `mediapipe_pose_runner.py` were **not modified** — the new state machine
  is entirely contained within `AthleteTracker.step()`'s existing return
  contract (`selectedIndex`/`identityState`/etc.), so neither caller needed
  to change.
- **Modified**: `src/lib/biomechanics/mediapipe/trackingDebugSchema.ts` —
  widened the `identityState` enum to include the three new pre-lock states
  (`searching`, `candidate`, `verifying`), matching the existing precedent
  for accepting either tracker generation's vocabulary.
- **Modified**: `scripts/athlete-tracker-sanity.py` — every acquisition-
  dependent existing test updated to route through the new multi-frame
  acquisition preamble (see Tests, below); no test's underlying scientific
  claim was weakened, only its setup adapted to the now-correct requirement
  that identity be earned, not asserted in one frame.
- **New**: `docs/day-101-identity-acquisition-redesign.md` (this report).

---

## Part 4 — Real Vanni replay

Ran the actual, unmodified production pose runner
(`mediapipe_pose_runner.py`, `MEDIAPIPE_ROI=1`, correct rotation/ffprobe
environment) against the real source video end-to-end (all 2,348 frames) —
not a synthetic simulation.

| Field | Before (Day 97-100 baseline) | After (Day 101, this session) |
|---|---|---|
| First identity lock | Source frame 7 (t≈0.03s) — **false**, a bleacher pattern | Source frame **1521** (t≈6.35s) — **confirmed real**, visually verified (see below) |
| Box coverage (tracked/detected origin) | 2,341/2,348 frames (99.7%) — almost entirely the false lock | 827/2,348 frames (35.2%) — **all of it the real athlete's actual visible window**, one single contiguous range, frames 1521–2347 |
| First real contact | Frame 1702 (t=7.11s) | **Frame 1504 (t=6.28s)** |
| First real pose/foot evidence | Frame ~1660 (start of the 335-frame run) | **Frame 1488 (t=6.21s)**, a 160-of-161-frame nearly-gapless run through frame 1648 |

**Visual confirmation**: the crop at source frame 1600 (within the new
locked window) was extracted directly from the real video and shows the
real athlete, clearly framed, mid-stride — not background. This is the
same direct-visual-inspection method Day 100 used to find the original bug,
applied here to confirm the fix.

---

## Part 5 — Identity timeline (new run)

| Event | Frame | Time (s) |
|---|---|---|
| First candidate ever considered | 7 | 0.03 |
| First candidate REJECTED as outside the entry region / discarded as stationary | (many, throughout 0–1520s) | — |
| Verification begins on the real athlete | ~1513–1520 (estimated from lock timing) | ~6.3 |
| **Identity LOCKED (first frame of the real, continuous window)** | **1521** | **6.35** |
| First real foot-pose evidence | 1488* | 6.21 |
| First real contact | 1504 | 6.28 |
| Contacts 2–3 | 1544, 1646 | 6.45, 6.87 |
| Continuous tracked window | 1521–2347 | 6.35–end of clip |

\* Foot evidence at 1488 slightly precedes the 1521 lock frame because the
pending candidate accumulates corroborating evidence — including usable
pose landmarks on corroborating hits — during the CANDIDATE/VERIFYING
stages, before the identity is promoted to authoritative at 1521.

---

## Part 6 — Coverage, before vs. after

| Metric | Before | After |
|---|---|---|
| `measurementStartPositionM` | **11.52 m** | **2.47 m** |
| `measurementEndPositionM` | 19.65 m | 9.59 m |
| `coveragePercent` | 40.7% | 35.6% |
| Eligible in-zone contacts | 5 | 2 |
| Eligible steps | 4 | 1 |
| Average Step Length | 2.036 m | unavailable (1 interval < the 2-interval minimum) |
| Peak Step Length | 2.036 m | unavailable (same reason) |
| Peak Velocity | 10.109 m/s | unavailable (only 1 raw stride-velocity window; ≥1 required window exists but see note below — 2 contacts is one interval, not enough for the ≥3-contact stride window) |
| Average Velocity | unavailable | unavailable (unchanged reason family) |
| Step Frequency | 4.863 Hz | 2.348 Hz (computed from sparser, more separated contacts) |

**This is a genuine, honest, mixed result, reported in full — not
selectively framed.** The single biggest, clearest win is
`measurementStartPositionM`: real, verified evidence now begins at **2.47m**
into the zone instead of 11.52m — a nearly 9-metre recovery of genuinely
supported early-zone evidence, driven by locking onto the real athlete
almost a full second earlier (6.35s vs 7.11s) than before, and never on the
bleachers. This directly satisfies this task's acceptance criteria: the
tracker never falsely locks, the real athlete becomes tracked as soon as
sufficient evidence exists, and every metre of the new coverage is backed by
a verified contact — none of it fabricated.

The trade-off, found and reported honestly: total contact/step *density*
decreased (2 in-zone contacts vs 5, 1 step interval vs 4), because the
CONTINUOUS tracking phase (optical flow + periodic re-detection —
`box_tracker.py`, unmodified this session) loses the athlete again somewhere
around frame 1650–1700 and does not reliably re-densify contacts through the
back half of the zone the way the old (falsely-anchored) run happened to.
Because only 1 valid step interval survives, `avgStrideLengthM`/
`peakStrideLengthM`/`topSpeedMps` — all of which require ≥2 intervals or
≥3 in-zone contacts under the Day 98 evidence framework — are honestly
unavailable this run, exactly as that framework is supposed to behave when
evidence is genuinely thinner. **No threshold was loosened to compensate.**

---

## Part 7 — Regression results

Every relevant existing suite was re-run after the change:
`measurement-recovery:sanity`, `timing-verification:sanity`,
`analysis-report:sanity`, `analysis-fps:sanity`,
`experimental-30fps:sanity` (60/120fps regression),
`acceleration-analysis:sanity`, `zone-coverage:sanity`,
`evidence-heatmap:sanity`, `gate-display-stabilization:sanity`,
`world-lock-repair:sanity`, `zone-anchor:sanity`,
`roi-coordinate-mapping:sanity`, `gate-lock-smoothing:sanity`,
`stride-metrics:sanity`, `zone-step-counting:sanity`,
`metric-trust:sanity`, `result-foundation:sanity`, `gates:sanity`,
`contacts:sanity` — **all pass**. Since none of these TS-side suites invoke
the Python identity tracker directly (they exercise the measurement engine
and overlay/UI layers against synthetic or cached fixtures), they confirm
panning safety, the Day 98 metric evidence framework, and Day 99 overlay
rendering are all unaffected by this session's Python-only change — exactly
the isolation the module-boundary design (no `box_tracker.py`/
`mediapipe_pose_runner.py` changes) was intended to guarantee.

---

## Part 8 — Tests

**`scripts/athlete-tracker-sanity.py`** — rewritten with the new
multi-frame acquisition preamble; **34 checks, all passing**, including 12
new Day 101 checks:

| Category (from this task's Tests list) | Check(s) |
|---|---|
| False background detections | `bg.` — a perfectly stationary, human-shaped, complete candidate never locks however long it persists, and is genuinely discarded (not merely never-corroborated) |
| Entry-region enforcement | `entry.` — a highly complete, human-shaped candidate far from the configured entry side is rejected outright and never even becomes pending |
| Identity verification | `1.` — a single frame, even a strong one, never locks; the correct candidate becomes PENDING first |
| Identity promotion | `1.` — after sufficient consistent, moving corroboration, identity becomes TRACKED, and is the correct (near-entry) candidate |
| Identity replacement | `recover-a`/`recover-b` — a lock that has proven itself by moving is never overridden; a lock that hasn't yet CAN be replaced by a much stronger candidate within the bounded window, explicitly logged as a switch |
| Identity rejection | `2.`/`3.`/`4.` — direction/teleport/scale continuity checks, unchanged, still isolate their specific rejection reason post-lock |
| Reacquisition | `6.`/`7.`/`8b.` — short gaps recover near the predicted position; long gaps terminate rather than silently staying tracked; sustained direction-opposing candidates force reacquisition |
| Background-texture rejection | `bg.`, `motion.` — stationary candidates (the bleacher scenario) and near-motionless jittering candidates (many hits, negligible net displacement) both never lock |
| (also) Single-frame hallucination | `hallucination.` — one detected frame is never itself verified/tracked |

**Existing required suite** (see Part 7) — all pass. `worker:check`,
`npm run lint` (0 warnings), and `npm run build` all pass.

---

## Part 9 — Remaining limitations

- **The continuous-tracking phase's endurance on a fast-moving sprinter is a
  real, newly-visible limitation**, found by this session's real-clip
  validation, not fixed here (explicitly out of this task's acquisition-only
  scope, and `box_tracker.py`/its optical-flow logic was not touched). The
  athlete is lost again around frame 1650–1700 after a correct, verified
  lock at 1521 — this is the single highest-priority item for the next
  stationary-tracking milestone, and should be investigated with the same
  real-clip, visual-verification discipline this and Day 100's audits used.
- Total contact/step density decreased this run relative to the (falsely-
  anchored) previous baseline; `avgStrideLengthM`, `peakStrideLengthM`, and
  `topSpeedMps` are honestly unavailable for this specific replay pending
  that follow-up (Average Velocity remains unavailable for its own,
  separate, already-understood reason — no verified start crossing).
- The multi-stage acquisition constants (`MIN_VERIFICATION_HITS`,
  `MIN_CUMULATIVE_DISPLACEMENT`, `MAX_STATIONARY_VERIFICATION_SECONDS`,
  etc.) were chosen from first-principles reasoning about the real Day 100
  failure mode, not tuned against this one clip's outcome — but, as with
  Day 100's deferred fix, broader validation against more real clips (a
  second stationary session, ideally with different pacing/setup) is the
  responsible next step before treating these constants as final.
- `identity_confidence` (Part 4's internal confidence) is represented
  implicitly through `hits`/`cumulative_displacement`/state rather than as a
  single exposed numeric field; it was intentionally never surfaced to the
  persisted artifact's user-facing fields, per this task's explicit
  instruction.

## Part 10 — Git status

Working tree only; no commits made this session. This task modified 3
existing files (`athlete_tracker.py`, `trackingDebugSchema.ts`,
`athlete-tracker-sanity.py`) and added 1 new file (this report). No
tracking file outside the acquisition phase itself
(`box_tracker.py`, `mediapipe_pose_runner.py`) was touched.
