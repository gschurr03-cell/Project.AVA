# AVA Ground-Truth Field Testing Protocol

Practical, at-the-track checklist for collecting a real ground-truth trial
that `scripts/validate-ground-truth-trial.mjs` can grade LEGACY_2D and
CANONICAL_LONGITUDINAL against (Phase R4C). This is stricter than the
existing [`docs/field-validation-protocol.md`](field-validation-protocol.md)
(which grades AVA's aggregate numbers against a timing gate + coarse tape
grid) because R4C needs **per-contact** longitudinal position — the two
protocols are complementary; run this one when you want contact-level model
comparison, not just a headline sanity check.

Nothing here changes analysis math. This produces a `GroundTruthTrial` JSON
fixture (`src/lib/validation/groundTruthTrial.ts`) — a record of what was
independently measured, kept completely separate from AVA's own output.

## Equipment

- Tripod (locked off — no handheld, no panning, no zoom during the run).
- Camera capable of 60/120/240 fps as needed for the day's matrix (Part Z).
- A long tape measure (30m+) or a surveyor's wheel, for laying out the zone
  and gates.
- A hand tape measure (2–5m) for reading individual touchdown positions
  against the nearest reference marker.
- Chalk or contact-marking spray, or narrow high-contrast tape, to mark each
  touchdown on the track surface as it happens (a spotter watching live, or
  reviewed from a phone slow-motion replay immediately after the run).
- Cones or a taut string line for the start/finish gates.
- An independent timing-gate system if available (Freelap/OVR/photocells) —
  optional but strongly recommended; see Part L in the R4C spec for what it
  can and cannot validate.
- A stopwatch as a fallback only if no timing gate is available (coarse; not
  a substitute for a real gate).

## Camera placement

- **Perpendicular** to the running lane, lens axis at 90° to the direction of
  travel, aimed at the middle of the zone.
- **Tripod locked off** — genuinely stationary. (A panning trial is out of
  scope for this protocol; R4B's stationary-canonical path is what's being
  validated here.)
- Set back far enough that the **entire zone plus ~10m of run-in and run-out**
  stays in frame — the athlete should never be entering/leaving frame
  mid-stride.
- Frame low enough / wide enough that **feet never clip the bottom edge** —
  ground contact is unreadable if the foot leaves frame at touchdown.
- Record the exact tripod position (a marked spot, or paced-off distance from
  a fixed landmark) so it can be reproduced for a same-day repeat trial.

## Zone measurement and gate placement (Part F — gate-origin contract)

The ground-truth longitudinal origin **must** use the same convention R4A/R4B
established in production: `s = 0` at the **midpoint of the two physical
start-gate endpoints**, `s = zoneLengthMeters` at the **midpoint of the two
physical finish-gate endpoints**. Follow this exactly or the ground truth and
AVA's coordinate will not agree on where zero is:

1. Place two physical markers (cones, or marks on the track) at the start
   line — one at each edge of the lane the athlete will run through — call
   these Start-A and Start-B. Do the same at the finish line (Finish-A,
   Finish-B). These are the same two-point "gate" AVA is calibrated against
   on screen.
2. Measure the straight-line distance from the **midpoint of Start-A/Start-B**
   to the **midpoint of Finish-A/Finish-B** with the long tape measure or
   wheel, along the direction of travel. Record this as `zoneLengthMeters` to
   the nearest cm. This is the same number entered as AVA's calibration
   distance for the session.
3. Do not use a single cone/marker as the gate — always use two points and
   take the midpoint, even if the lane looks straight; this matches exactly
   what the calibration UI captures on screen (`startBoundary`/
   `finishBoundary`, each a 2-point line) and keeps ground truth and AVA on
   the same coordinate.

## Distance reference markers (Part E)

Two different things are easy to conflate — keep them separate:

- **Reference marker spacing** — how far apart the physical marks on the
  ground are.
- **Measurement accuracy** — how precisely you can state a touchdown's
  position, which comes from a hand tape measure read against the *nearest*
  marker, not from marker density alone.

Recommendation: lay physical markers **every 0.5 m** through the zone (matches
the existing field-validation protocol's tape grid — reuse the same setup for
both). Do **not** mark every 1 cm or 5 cm — at AVA's current precision ceiling
(roughly 3–7 cm, per R4A/R4B) that density is wasted effort and implies false
precision that a human reading a chalk mark against a tape can't actually
achieve outdoors. For each touchdown:

1. Note which 0.5 m interval the touchdown falls in.
2. Use the hand tape measure to read the exact offset from the nearest 0.5 m
   marker to the touchdown mark, to the nearest cm.
3. Record `sGroundTruthM` as the marker's known distance from the start-gate
   midpoint, plus/minus that offset. Record `uncertaintyM` honestly — typical
   values are ±0.01–0.02 m for a careful tape read of a clear chalk mark, more
   (±0.03–0.05 m) for a mark that's smeared, a foot that visibly slid, or a
   review done from video rather than a live spotter.

If time is short and a full tape reading per touchdown isn't practical,
0.5 m-interval-only readings (uncertainty ±0.25 m) are still usable — enter
that as `uncertaintyM` honestly; the validator degrades gracefully and the
model-selection policy will simply need more trials to reach significance.

## FPS settings

Set the FPS explicitly per Part Z's trial matrix (60/120/240) rather than
letting the camera auto-select. Confirm the actual recorded FPS afterward
(e.g. via `ffprobe`) — AVA's own benchmark registry has caught recorded FPS
silently drifting from the requested setting before (see
`docs/stationary-validation-registry.md`).

## Run-in / run-out distance

Give the athlete **at least 10 m before** the start gate to reach a
consistent running posture (this is a "fly" zone measurement, not a start-line
sprint) and **at least 5–10 m after** the finish gate to decelerate — the
athlete should never look like they're slowing down before the finish gate in
frame.

## Marking touchdowns without using AVA

Two practical options, pick based on what's available:

- **Live spotter + chalk/contact spray**: a second person watches the
  athlete's feet in real time (or reviews a phone's slow-motion capture
  immediately after) and marks each touchdown on the track as it happens.
  Fast, but foot-side identification can be missed in a live pass — a
  slow-motion phone replay immediately after the run is more reliable than a
  live call.
- **High-fps reference video**: a second camera (or the same camera at a
  higher fps than the analysis clip) filming the same zone from a slightly
  different, clearly-labeled angle, reviewed frame-by-frame afterward to
  identify touchdown frames and read position against the 0.5 m grid in
  frame. This is the recommended default when a spotter isn't available,
  since it leaves a reviewable, re-checkable record instead of a one-time
  live call.

Either way, the touchdown positions are read **independently of AVA** —
never by looking at AVA's own overlay or output first.

## Recording timing-gate results

If timing gates are running the same zone simultaneously: record the
gate-reported `entryTimeS`/`exitTimeS`/`zoneTimeS` (or just zone time if
that's all the system reports) and which system it was (Freelap/OVR/other).
Note the gate's own stated accuracy as `uncertaintyS` if published by the
manufacturer; if unknown, a conservative ±5 ms is reasonable for photocell
systems.

**Peak Velocity cannot be validated by a full-zone timing gate** (Part N) — a
single start/end time only gives average velocity over the whole zone. Leave
`peakVelocity.available: false` unless you have a genuinely independent
short-interval measurement (radar gun, laser, or a short (~2–3 m) secondary
timing segment placed where peak velocity is expected). Do not substitute
AVA's own displayed peak velocity — the validator explicitly rejects that.

## Labeling each video / preserving raw files

- File name: `<athlete>_<fps>fps_<trialNumber>_<YYYYMMDD>.<ext>` (e.g.
  `gav_120fps_trial2_20260812.mov`).
- Keep the **raw, unedited** camera file — do not trim, re-encode, or
  stabilize before upload; AVA's own calibration and pose pipeline need the
  original frames.
- Record alongside each video (a phone note or a shared sheet is fine):
  tripod position, `zoneLengthMeters` and how it was measured, gate marker
  positions, FPS, timing-gate result + system, and the touchdown log
  (contact number, side if known, position, timestamp if known, method,
  uncertainty) — this is exactly the `GroundTruthTrial` shape in
  `src/lib/validation/groundTruthTrial.ts`; filling in the fields on-site
  saves re-deriving them later.
- Back up raw video + notes before leaving the track (a synced phone photo of
  handwritten notes is enough) — a lost note invalidates that trial's
  ground truth even if the video survives.

## Avoiding camera movement

Once the tripod is set and locked, do not bump, re-aim, or re-zoom it between
trials at the same station — every trial recorded from that setup shares one
calibration. If the camera must move (e.g., a different zone/angle), treat it
as a new "camera position" for the aggregation grouping in Part R and start a
fresh gate-measurement pass (re-measure `zoneLengthMeters`, re-place markers).

## Number of trials per setup

See the trial matrix (below) for the FPS-focused recommendation. As a general
rule: **at least 2 trials per condition** (same athlete/FPS/camera position)
so a single bad rep (stumble, missed contact, obscured foot) doesn't define
that condition's data point.

---

## Recommended cross-FPS trial matrix (Part Z)

Goal: understand whether LEGACY_2D vs CANONICAL_LONGITUDINAL behavior changes
with FPS, using the **same athlete and comparable running condition** so FPS
is the only thing varying.

| FPS | Trials | Notes |
| --- | --- | --- |
| 60  | 2 | Baseline AVA is tuned for this rate. |
| 120 | 2 | |
| 240 | 2 | Lower per-frame motion blur; more frames per contact. |

**6 trials total for the primary matrix**, same athlete, same camera position
and zone, back-to-back on the same day (to hold fatigue/surface/wind roughly
constant). This is deliberately small — six good, fully-measured trials with
real per-contact ground truth are worth more than dozens of trials with
coarse or missing ground truth. If a second athlete is available, repeating
the same 6-trial matrix with them is the highest-value next addition (it
directly satisfies the model-selection policy's `minDistinctAthletes: 2`
requirement — see `src/lib/validation/modelSelectionPolicy.ts`) — but do not
delay the first athlete's matrix waiting for a second.

Do not chase dozens of runs per FPS class; the model-selection policy's
statistical thresholds (`docs/phase-r4c-ground-truth-scientific-validation-harness.md`)
were sized for roughly this scale of data, not a large-N study.
