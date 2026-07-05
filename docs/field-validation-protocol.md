# Field Validation Protocol (Tuesday testing day)

How to run a real-athlete trial so AVA's numbers can be graded against ground
truth (timing gates + tape grid). This is **validation only** — nothing here
changes analysis math.

## Capture checklist (on the track)

Get these right and the video is gradeable; miss them and the comparison is noise.

- **60 fps** recording (120/240 fps is even better for contact/flight, but 60 is
  the baseline AVA is tuned for).
- **Tripod**, camera locked off — no handheld, no panning during the run.
- **Perpendicular camera**: lens axis at 90° to the running lane, aimed at the
  middle of the zone. Set back far enough that the whole zone is in frame.
- **20 m timed zone** marked by the two calibration gates (cones/lines AVA will
  calibrate against).
- **10 m visible before and after** the zone, so acceleration into and out of the
  gates is captured (the athlete is never entering/leaving frame mid-stride).
- **0.5 m tape marks** on the ground through the zone if possible — these are the
  ground truth for individual step length (read off which mark each foot lands
  nearest).
- **Timing gates running simultaneously** (Freelap / OVR) across the same 20 m —
  their time is the ground-truth zone time and velocity.
- **Keep the runner fully visible** the entire time — head to feet in frame every
  frame; don't let feet clip the bottom edge.

## What to record per trial

Write these down as the athlete runs (a phone note is fine):

| Ground truth | Field |
| --- | --- |
| Timing-gate zone time (s) | `gateTimeS` |
| Gate system | `gateSystem` (Freelap / OVR) |
| Zone distance (m) | `zoneDistanceM` (usually 20) |
| Hand-counted foot contacts through the zone | `manualStepCount` |
| Step lengths from tape marks (m), first→last | `manualStepLengthsM` |

Anything you can't capture, leave out — the report degrades gracefully and lists
what went unvalidated.

## Running the comparison

1. Upload the trial video and let AVA analyze it as usual (this produces the pose
   artifact + calibration for the session — no math is touched by validation).
2. Copy `scripts/field-trial.template.json`, fill in what you measured:

   ```json
   {
     "label": "Athlete A — trial 1",
     "zoneDistanceM": 20,
     "gateTimeS": 1.93,
     "gateSystem": "Freelap",
     "manualStepCount": 9,
     "manualStepLengthsM": [2.08, 2.09, 2.15, 2.10, 2.16, 2.11, 2.16, 2.25, 2.18]
   }
   ```

3. Run the validator (recomputes AVA from the pose artifact + calibration, then
   compares):

   ```bash
   npm run field:validation -- --truth trial.json --session <session-id> --pose <artifact.json>
   # quick inline form (no file):
   npm run field:validation -- --gate-time 1.93 --steps 9 --distance 20 --gate Freelap
   ```

   Omit `--session`/`--pose` to grade the linked benchmark (Calab) session.

## What the report grades

- **Zone time** — AVA vs the timing gate (s, %).
- **Average velocity** — AVA vs `distance ÷ gate time` (m/s, %).
- **In-zone contact count** — AVA vs your hand count.
- **Cadence** — `contacts ÷ gate time` computed **the same way on both sides** so
  it's apples-to-apples. Note: this differs from AVA's *displayed* combined
  frequency, which uses the contact-to-contact span; that headline value is shown
  for context but not scored, to avoid a fake error from mixing definitions.
- **Average step length** — AVA vs the mean of your tape-grid steps.
- **Per-step length** — AVA vs tape grid, aligned step-by-step, error in cm and %.

Errors are reported in seconds, m/s, meters, cm, and %.

## Known caveats going in (from the VueMotion diagnostic)

- The **combined** metrics (zone time, avg velocity, avg step length, contact
  count) are the trustworthy headline numbers — expect these to match closely.
- **Individual step length** carries a per-side worldX foot-placement bias (left
  steps read slightly long, right slightly short) that cancels in the combined
  mean. Per-step errors of a few cm are expected and are the target of future
  accuracy work — not a validation failure.
- The **first (boundary) step** is a partial: AVA measures the real contact-to-
  contact gap while gate/tape references often estimate a full step. Compare it
  with care; it is the largest single-step discrepancy by design.

See `scripts/step-comparison.mjs` (`npm run benchmark:steps`) for the step-by-step
VueMotion diagnostic behind these caveats.
