# R5A.3 — Inspect Vanni 60 FPS Part 2 Source Metadata

Continuation of [`docs/r5a1-video-metadata-path.md`](r5a1-video-metadata-path.md) and
[`docs/r5a2-fps-value-flow.md`](r5a2-fps-value-flow.md), both kept immutable.
Investigation only. No production code was modified, run against production
data, or used to write anything to the database. All probes below were run
directly against the local copies in `tmp/phaseR5/source-videos/` using the
exact same tools/commands AVA's own `probe_fps_evidence()` uses (real
`ffprobe`/OpenCV, invoked read-only from a throwaway script), plus AVA's
actual `probe_fps_evidence()`/`classify_fps()` Python functions imported
directly (unmodified) so the results are the true production decision, not a
reimplementation.

## Terminology used throughout

- **USER-CONFIRMED CAPTURE RATE** — the frame rate the user states the camera
  was actually set to and actually recorded at, established by recording
  order (60 → 120 → 240) and file-creation sequence, independent of any tool.
- **MEDIA-REPORTED / DECODED RATE** — whatever a specific tool (ffprobe,
  OpenCV, or AVA's own classifier) computes from the file's own container/
  stream data. This is what's being investigated, not what's trusted.

These are never conflated below. Where they disagree, the disagreement is the
finding, not something to "correct" by picking whichever number looks right.

## Scope of this phase

Full analysis: `tmp/phaseR5/source-videos/IMG_4848.mov` — **USER-CONFIRMED
CAPTURE RATE: 60 FPS**.

Minimal, stream-level-only comparison probes were also run on `IMG_4849.mov`
(user-confirmed 120 FPS) and `IMG_4850.mov` (user-confirmed 240 FPS) — no
frame-timestamp evidence, no content/frame-count forensics, and no root-cause
determination for those two. That belongs to R5A.4/R5A.5.

## IMG_4848.mov — full metadata probe (USER-CONFIRMED: 60 FPS)

### Stream-level ffprobe (identical command to `probe_fps_evidence()`, `mediapipe_pose_runner.py:128-132`)

```
ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate,r_frame_rate,duration,nb_frames -of json IMG_4848.mov
```

```json
{
  "r_frame_rate": "60/1",
  "avg_frame_rate": "3912/65",
  "duration": "2.708333",
  "nb_frames": "163"
}
```

| Field | Raw | Decimal | Meaning |
| --- | --- | --- | --- |
| `r_frame_rate` | `60/1` | **60.0** exactly | container's nominal/base rate tag |
| `avg_frame_rate` | `3912/65` | **60.184615...** | container's average-rate tag |
| `duration` | `2.708333` | 2.708333 s | container-declared duration |
| `nb_frames` | `163` | 163 | container-declared frame count |
| `realFps` (163/2.708333) | — | **60.184623...** | frame_count/duration derivation — agrees with `avg_frame_rate` to 5 decimal places |

### Frame-level timestamp probe (identical command to `probe_fps_evidence()`, `mediapipe_pose_runner.py:133-136`, `-read_intervals %+5` — this clip is only 2.7s, so this covers the entire file)

169 raw CSV lines returned (one blank/unparseable line skipped, matching the
`try/except ValueError` behavior in the real code) → 163 valid timestamps →
162 deltas.

- **`timestampFps` (median of real inter-frame deltas) = 59.998800...** — extremely close to a true 60.000 Hz clock (consistent with an NTSC-derived 60000/1001-style source clock).
- `min_delta = 0.006667s`, `max_delta = 0.018333s` — one anomalously short delta near the start of the clip (a single-frame startup irregularity, not a sustained rate change) trips the code's own `>2ms spread` VFR heuristic.

### OpenCV (`cv2.CAP_PROP_FPS`, identical to `mediapipe_pose_runner.py:2909`)

`CAP_PROP_FPS = 60.184615384615384` — identical to `avg_frame_rate`, as expected (both read the same container tag via different libraries). Codec: `hevc`. Frame count: 163. Resolution: 1806×1016.

### AVA's actual `probe_fps_evidence()` output (real function, real file, unmodified)

```json
{
  "averageFps": 60.184615384615384,
  "nominalFps": 60.0,
  "realFps": 60.18462279195357,
  "timestampFps": 59.998800023999564,
  "variableFrameRate": true,
  "durationSeconds": 2.708333,
  "frameCount": 163
}
```

### AVA's actual `classify_fps()` decision (real function, real evidence, unmodified)

```
src_fps  = evidence["averageFps"] or opencv_fps = 60.184615384615384
detected = 60.184615384615384
```

`59 ≤ detected ≤ 60.5` → **branch 3 matches** → **`classification = "validated_60_fps_class"`**, **`reason = "average_rate_in_validated_60_range"`**, **`tier_analysis_fps = 60`**.

### Result for IMG_4848.mov

| | Value |
| --- | --- |
| USER-CONFIRMED CAPTURE RATE | **60 FPS** |
| MEDIA-REPORTED / DECODED RATE (`avg_frame_rate`) | 60.185 FPS |
| MEDIA-REPORTED / DECODED RATE (`r_frame_rate`) | 60.000 FPS |
| MEDIA-REPORTED / DECODED RATE (real decoded timestamps) | 59.999 FPS |
| AVA's actual classification (real code, real file) | `validated_60_fps_class`, `analysisFps=60` |

**All four numbers agree with the user-confirmed capture rate, and AVA's real classifier correctly identifies this file.** This is the expected, working baseline — every signal in `probe_fps_evidence()` is internally consistent for a genuine 60fps capture, and `classify_fps()`'s branch-3 shortcut (no timestamp corroboration required) does not cause any error here because there is nothing to catch: the raw `avg_frame_rate` reading is simply correct for this file. This establishes the control case the 120/240 files will be compared against in R5A.4/R5A.5.

## Minimal comparison probes — IMG_4849.mov and IMG_4850.mov

Stream-level only (no timestamp evidence, no frame-content forensics — deferred):

| File | USER-CONFIRMED CAPTURE RATE | `r_frame_rate` | `avg_frame_rate` | `duration` | `nb_frames` | `nb_frames / duration` | AVA would classify as |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `IMG_4849.mov` | **120 FPS** | 30/1 = 30.0 | 30.0 | 2.866667 s | 86 | 30.0 | `experimental_30_fps_class`, `analysisFps=30` |
| `IMG_4850.mov` | **240 FPS** | 30/1 = 30.0 | 30.0 | 2.666667 s | 80 | 30.0 | `experimental_30_fps_class`, `analysisFps=30` |

(The classification column reflects running AVA's real, unmodified `classify_fps()` against this stream-level evidence only — a minimal comparison probe, not the full timestamp-corroborated forensic analysis R5A.4/R5A.5 will perform.)

### An important discrepancy this reveals, flagged and not resolved here

R5A.2's thought trace (formed from static code reading alone, before any real
file existed to check) predicted **120→30** and **240→60** as the two
observed misclassification patterns, based on the originally reported
symptom ("the 240 FPS recording was saved/displayed by AVA as approximately
60 FPS"). The real file now measured shows **both** `IMG_4849.mov` (120fps)
**and** `IMG_4850.mov` (240fps) reporting `avg_frame_rate = r_frame_rate =
30.0` exactly — i.e., this specific 240fps file's container currently reads
as ~30fps, not ~60fps as originally reported.

Also notable, stated as an observation only: for a genuine 120fps capture
lasting 2.867s, ~344 frames would be expected; the container reports 86 —
exactly **344 ÷ 4**. For a genuine 240fps capture lasting 2.667s, ~640 frames
would be expected; the container reports 80 — exactly **640 ÷ 8**. Both
reported `nb_frames` values are consistent with `duration × 30`, i.e. the
container's declared duration and declared frame count agree with each other
at exactly 30fps — this is not simply one wrong metadata tag disagreeing with
right ones; several independent stream-level fields (`r_frame_rate`,
`avg_frame_rate`, `duration`, `nb_frames`) all agree with each other at 30fps
for both files.

**This is flagged, not explained.** It is not yet known from this phase's
evidence alone whether: (a) these specific files were altered in some way
between original capture and being placed in the `Vanni Pt 2 files` folder
(export/AirDrop/Messages re-encoding is a plausible mechanism for silently
dropping to a lower frame rate while preserving real elapsed duration), (b)
the originally-reported "240→~60" symptom was observed on a different
recording/session than these specific files, or (c) something else. Resolving
this — including determining whether the *frames themselves* were resampled
(a real 30fps-equivalent file) versus only the *metadata tags* are wrong
while more real frames exist in the bitstream than the tags claim — is
explicitly R5A.4/R5A.5's job, not this phase's. No conclusion is drawn here.

## Verification against acceptance framing

- USER-CONFIRMED CAPTURE RATE and MEDIA-REPORTED/DECODED RATE are reported
  separately for every value above; the capture-rate label was never adjusted
  to match any tool's output.
- IMG_4848.mov (known-good 60fps) was fully probed using AVA's real,
  unmodified production functions — not a reimplementation — confirming the
  classification pipeline works correctly when the underlying container
  metadata is itself accurate.
- IMG_4849.mov/IMG_4850.mov received only minimal, explicitly-scoped
  stream-level comparison probes, with a real, notable discrepancy from the
  R5A.2 prediction surfaced and flagged rather than either ignored or
  prematurely explained.

## Production Modification Guard

```
$ git status --short -- src scripts supabase
```
No new changes beyond the pre-existing session baseline (confirmed same as
prior phases). Only `docs/r5a3-vanni-60fps-part2-source-metadata.md` was
added. No `ffmpeg`/transcoding operation was performed on any source file —
every probe was read-only (`ffprobe`, `cv2.VideoCapture` property reads,
Python function calls that themselves only shell out to read-only `ffprobe`
invocations).

---

### R5A.3 — Result

**PASS**

### IMG_4848.mov (USER-CONFIRMED 60 FPS) — media-reported rate

`avg_frame_rate ≈ 60.185`, `r_frame_rate = 60.000`, real decoded-timestamp rate `≈ 59.999` — all agree with the confirmed capture rate. AVA's actual, unmodified `classify_fps()` correctly returns `validated_60_fps_class`, `analysisFps=60` for this real file.

### Minimal comparison findings (IMG_4849.mov / IMG_4850.mov)

Both currently report `avg_frame_rate = r_frame_rate = 30.0` at the stream level (not the 120/240 the user confirmed), and both would be classified `experimental_30_fps_class` by AVA's real, unmodified classifier. This does not match the originally-reported "240→~60" symptom for the 240fps file specifically — a real discrepancy, flagged here and left unresolved for R5A.4/R5A.5.

### Files added

`docs/r5a3-vanni-60fps-part2-source-metadata.md`

### Production files changed

`NONE`

### Ready for

`R5A.4` (scope not yet specified — likely full forensic analysis of `IMG_4849.mov`, per the established per-file pattern)

Not started, per instruction.

---

**Current prompt:** `R5A.3`
**Prompt status:** `COMPLETE`
**Completed micro-tasks:** `3 / 197`
**R5 completion:** `1.52%`
