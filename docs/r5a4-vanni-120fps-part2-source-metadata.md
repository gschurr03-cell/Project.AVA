# R5A.4 — Full Forensic Analysis of Vanni 120 FPS Part 2 (`IMG_4849.mov`)

Continuation of R5A.1–R5A.3 (all kept immutable). Investigation only — no
production code, database, or source file was modified. Raw diagnostic
output lives in `tmp/phaseR5/r5a4/` (git-ignored); this document summarizes
it. USER-CONFIRMED CAPTURE RATE for this file is **120 FPS** — that label is
never adjusted below, regardless of what any tool reports.

## R5A.4.1 — Source identity

- Path: `/Users/imac/Projects/Project.AVA/tmp/phaseR5/source-videos/IMG_4849.mov`
- Size: 4,625,111 bytes
- SHA-256: `62fd0e696a03a47354d82bce3789ab5f8ce7baf00376177f76bafc5919c147d6`
- Matches the previously-recorded hash from the Phase-prep step exactly (same value reported in the R5A prep completion report).
- `git check-ignore -v` confirms the file falls under `.gitignore:33 /tmp/`; `git status --short` shows nothing trackable for it.

## R5A.4.2 — Container stream enumeration

`ffprobe -show_format -show_streams -show_programs -show_chapters` → **4 streams**, not 1 (raw dump: `tmp/phaseR5/r5a4/format-streams-full.json`):

| Index | Type | Codec | Handler | Duration | `nb_frames` | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | video | hevc (Main, level 120), yuvj420p | Core Media Video | 2.866667 s | 86 | `rotate: 180` tag; the video stream. |
| 1 | audio | aac (LC) | Core Media Audio | 2.780667 s | 133 | |
| 2 | audio | (unspecified codec name in probe) | Core Media Audio | 2.843333 s | 136 | A second audio stream — likely a stereo/secondary mic pair common on modern iPhones. |
| 3 | data | — | Core Media Metadata | 2.843333 s (stream-level, `time_base 1/2400`) | 1 | A structured Apple metadata track — see R5A.4.10/11. |

**No second video track exists.** No hidden/auxiliary high-rate video stream is present anywhere in this container — ruling out one flavor of Case D ("alternate/hidden video track") outright.

## R5A.4.3 — Full container (format-level) metadata

From `format.tags` (full dump in `tmp/phaseR5/r5a4/format-streams-full.json`):

```
major_brand: "qt  "
minor_version: 0
compatible_brands: "qt  "
creation_time: 2026-08-12T03:07:46.000000Z
com.apple.quicktime.make: Apple
com.apple.quicktime.model: iPhone 16
com.apple.quicktime.software: 26.5.2
com.apple.quicktime.creationdate: 2026-08-11T18:29:11-0600
com.apple.quicktime.location.ISO6709: +39.9911-105.1036+1601.356/
com.apple.quicktime.location.accuracy.horizontal: 4.748652
com.apple.quicktime.full-frame-rate-playback-intent: 0
```

`com.apple.quicktime.creationdate` (`2026-08-11T18:29:11-0600`) matches the
local file's own filesystem modification timestamp recorded during the prep
step exactly — consistent with this being the original, unedited camera
file, not a re-export (a re-export/re-save typically updates this to the
export time, not the original capture time).

**`com.apple.quicktime.full-frame-rate-playback-intent: 0`** — a real, documented Apple QuickTime metadata key associated with high-frame-rate/slow-motion capture. Its presence is evidence this file's provenance is connected to Apple's HFR/slow-mo capture pathway. Its precise semantic meaning for the literal value `0` is not something this investigation independently verifies against Apple's internal documentation — it is reported as a data point (as instructed: "report only what the file contains"), not interpreted as proof of any particular mechanism.

## R5A.4.4 — Full video-stream metadata (stream 0)

| Field | Value |
| --- | --- |
| codec | hevc, profile Main, level 120 |
| pix_fmt | yuvj420p |
| width × height (display) | 1820 × 1024 |
| coded_width × coded_height | 1824 × 1024 |
| `r_frame_rate` | `30/1` = 30.0 exactly |
| `avg_frame_rate` | `30/1` = 30.0 exactly |
| `time_base` | `1/2400` |
| `start_pts` / `start_time` | 0 / 0.000000 |
| `duration_ts` / `duration` | 6880 / 2.866667 s |
| `nb_frames` | 86 |
| `bit_rate` | 12,400,445 bps |
| rotation | `-180°` (Display Matrix side data + `rotate: 180` tag) |
| tags | `encoder: HEVC`, `handler_name: Core Media Video` |

Every rational value above is reported exactly as ffprobe returns it (no rounding applied in this table).

## R5A.4.5/4.6 — Full frame enumeration and count

`ffprobe -show_frames` over the entire video stream (no sampling — full
dump: `tmp/phaseR5/r5a4/frames-4849.json`): **exactly 86 decoded frames.**

Cross-checked four independent ways, all in exact agreement:

| Method | Count |
| --- | --- |
| ffprobe `nb_frames` (container-declared) | 86 |
| ffprobe `-show_frames` (actual decode) | 86 |
| ffprobe `-show_packets` (encoded video packets) | 86 |
| MOV `stts` sample table (`mdia/minf/stbl/stts`) | 86 (single entry: `sample_count=86, sample_delta=80`) |
| MOV `stsz` sample table | 86 |
| OpenCV `cap.read()` loop (actual decode) | 86 |
| OpenCV `CAP_PROP_FRAME_COUNT` | 86 |

**duration × 30 = 2.866667 × 30 = 86.0 exactly. duration × 120 = 344.** The
file contains 86 frames, not 344 — every counting method, at every layer
(container metadata, sample table, packet count, actual decode by two
independent decoders), agrees on 86.

## R5A.4.7 — Timestamp delta analysis

From `best_effort_timestamp_time` across all 86 frames (85 deltas):

| Statistic | Value |
| --- | --- |
| median delta | 33.3330 ms |
| mean delta | 33.3333 ms |
| min delta | 33.3330 ms |
| max delta | 33.3340 ms |
| stdev | 0.00047 ms (effectively zero) |
| unique delta bucket (rounded to 0.01ms) | **one single value: 33.33ms, all 85 deltas** |
| deltas within 1ms of 33.333ms (30fps) | **85 / 85** |
| deltas within 1ms of 16.667ms (60fps) | 0 / 85 |
| deltas within 1ms of 8.333ms (120fps) | 0 / 85 |

This is a **perfectly uniform 30.0003 fps signal** with essentially zero
jitter — not a mixed/irregular timing pattern, not a partial 120fps
signature buried in noise.

## R5A.4.8 — Duplicate-frame check

Full-frame SHA-256 (raw decoded pixel buffer) across all 86 OpenCV-decoded
frames: **0 exact duplicate adjacent frames; all 86 hashes unique.**

Consecutive-frame mean absolute pixel difference: min 0.213, max 1.774, mean
0.665 (0–255 scale). 72 of 85 consecutive pairs show a frame-wide mean
difference below 1.0. This is **not** interpreted as evidence of
near-duplicate/padded frames — a wide-shot 20m sprint-zone recording is
mostly static background with a small moving subject, which naturally
produces a low frame-wide average difference even with real motion present.
Reported as measured, not as a conclusion either way. **The decisive finding
here is the 0 exact duplicates**: whatever these 86 frames are, they are 86
genuinely distinct captured images, not a small set of frames repeated to
pad out a count.

## R5A.4.9 — Packet count

Video packet count (`ffprobe -show_packets`, video stream only): **86** —
identical to the decoded-frame count and the `stts`/`stsz` sample counts.
No additional encoded samples exist beyond what normal frame enumeration
already reports; there is no discrepancy between "packets" and "frames" to
explain.

## R5A.4.10 — MOV/QuickTime timing-table inspection

Direct atom-level parsing (`tmp/phaseR5/r5a4/mov-timing-tables-4849.json`,
raw stdlib box walker, read-only — see `tmp/phaseR5/r5a4/mov_atom_walk.py`),
video track (track index 0):

```
mdhd:  timescale=2400, duration=6880 ticks (= 2.866667 s)
stts:  1 entry -> {sample_count: 86, sample_delta: 80}   (80/2400 = 33.333ms, uniform)
stsz:  sample_count=86
ctts:  present (86 entries) — normal B-frame composition-time reordering
       (values like +240, 0, -160, -80 ticks), NOT a rate indicator
elst:  1 entry -> {segment_duration: 137600 (movie timescale 48000 ticks
       = 2.866667s), media_time: 0, media_rate: 1.0}
```

**`media_rate: 1.0`, single edit-list segment covering the entire media, `media_time: 0`.** This is a flat, unstretched, 1:1 edit list — the standard structure for a normally-presented clip. **There is no edit-list-based retiming present for the video track.** If this file used Apple's slow-motion edit-list mechanism to present a high-rate media timeline through a slower movie timeline, the edit list would show a non-unity `media_rate` and/or a `segment_duration` that disagreed with the underlying media's real span; neither is observed. **This rules out Case B** (high-speed capture retimed to 30fps playback via QuickTime edit-list mechanics) for this specific file, based on direct atom inspection — not inference from ffprobe's summary view.

**The `mdhd` timescale (2400) and `stts` sample delta (80 ticks = 33.33ms) directly encode a genuinely uniform 30fps sample table** — this is the actual, low-level sample-timing structure of the file, independent of any container-level tag ffprobe merely summarizes. This is the strongest evidence in this investigation: it is not a metadata label that could be "wrong" while real samples say otherwise — the sample table **is** the real samples' timing.

## R5A.4.11 — Auxiliary/metadata track

Track index 3 (`handler_type: meta`, "Core Media Metadata") has its own
`mdhd`: `timescale=2400, duration=35336` ticks = **14.7233 seconds** — far
longer than the visible clip's 2.867s. Its `elst`: `segment_duration=136480`
(movie-timescale ticks ≈ 2.843s), `media_time=28512` (at the track's own
2400 timescale ≈ 11.88s offset into its own 14.72s underlying media),
`media_rate=1.0`.

This is reported as a genuine, measured curiosity: an auxiliary metadata
track whose own underlying media is ~5.14× longer than the visible clip,
sliced by a (still 1:1-rate) edit list to the visible 2.843s window. This
track's sample payload (44 bytes per `stsz`) was not decoded in this phase —
identifying its exact schema (Apple's `mebx` timed-metadata format
frequently carries things like exposure, motion/gyro data, or HDR metadata,
but confirming which requires decoding the sample content, not attempted
here) is out of scope for R5A.4. It is **not** a second video track and
contains no image samples, so it cannot itself be a source of hidden video
frames — flagged for awareness, not pursued further.

No `com.apple.quicktime.slow-motion`-style key, no dedicated capture-rate/
playback-rate timed-metadata key, and no additional Apple-specific tag
beyond those listed in R5A.4.3 was found in the format-level tag dump.
Per the task's own framing: absence of further metadata does not itself
prove anything about the camera's original setting — only the sample-table
evidence in R5A.4.10 does that.

## R5A.4.12/4.13 — OpenCV full decode and FFmpeg/OpenCV comparison

Full `cap.read()` loop over the entire file (not `CAP_PROP_FRAME_COUNT`
alone): **86 successful decodes**, matching the declared count exactly.
`CAP_PROP_POS_MSEC` across all 86 frames: perfectly monotonic, uniform
33.333ms spacing (stdev ~1.8×10⁻¹³ ms — floating-point noise floor), exactly
one zero timestamp (the first frame, expected), zero non-monotonic or
repeated timestamps, zero resets.

| Measurement | FFmpeg/FFprobe | OpenCV |
| --- | --- | --- |
| Declared FPS | `avg_frame_rate`=30.0, `r_frame_rate`=30.0 | `CAP_PROP_FPS`=30.0 |
| Frame count | `nb_frames`=86 | `CAP_PROP_FRAME_COUNT`=86 |
| Decoded frames | 86 (`-show_frames`) | 86 (actual `.read()` loop) |
| Median timestamp delta | 33.333 ms (`best_effort_timestamp_time`) | 33.333 ms (`CAP_PROP_POS_MSEC`) |
| Effective FPS | 30.0003 (from real per-frame decode timestamps) | 30.0 |

**No disagreement between FFmpeg and OpenCV.** Both decoders, using
independent codepaths, report the identical frame count and identical
uniform timing. There is nothing for either tool to "disagree" about here —
they concur completely.

## R5A.4.14 — AVA's actual, unmodified production probe

`probe_fps_evidence()` (real function, real file, imported unmodified):

```json
{
  "averageFps": 30.0,
  "nominalFps": 30.0,
  "realFps": 29.99999651162831,
  "timestampFps": 30.00030000299998,
  "variableFrameRate": false,
  "durationSeconds": 2.866667,
  "frameCount": 86
}
```

`classify_fps()` (real function, this real evidence, unmodified):
**`classification = "experimental_30_fps_class"`**,
**`reason = "average_rate_in_experimental_30_range"`**,
**`tier_analysis_fps = 30"`**.

**This is the single most important corrective finding of R5A.4.** R5A.1/
R5A.2's hypothesis (formed from static code reading, before any real file
existed to test) was that a metadata-tag misread (`avg_frame_rate` wrong)
would be caught, or not caught, depending on whether `timestampFps`
disagreed and whether that disagreement was consulted. **For this real
file, `timestampFps` (30.00030...) does NOT disagree with `averageFps`
(30.0) at all.** All four of AVA's own evidence signals agree with each
other. `classify_fps()`'s branch-3/5 "no corroboration required" shortcut
identified in R5A.1/R5A.2 is **not the operative mechanism for this
file** — there is nothing for corroboration to catch, because the real
decoded-timestamp evidence itself says ~30fps, matching the container tags.
**AVA's classifier is behaving correctly relative to what is actually
encoded in this file.**

## R5A.4.15 — AVA's timestamp path for this file

`classification = "experimental_30_fps_class"` is a member of
`NATIVE_RATE_FPS_CLASSES` (confirmed in R5A.4.14's output and by direct
reference to `mediapipe_pose_runner.py:40-45`), so per the mechanism
documented in R5A.2 §2.11, every frame's `analysis_timestamp_ms` would be
`source_timestamp_ms` (real, `cv2.CAP_PROP_POS_MSEC`-derived) — which, per
R5A.4.12, is a clean, monotonic, uniform-33.333ms series. **AVA would
receive exactly 86 timestamped observations for this file, spanning
2.867 real seconds at real ~33.3ms spacing — not 344.** There are only 86
real samples to timestamp, correctly or otherwise; no amount of correct
timestamp handling can produce information that was never encoded.

## R5A.4.16 — Information recoverability

> Does this exact MOV currently contain enough temporal information for AVA to perform genuine 120 FPS analysis?

**NO.**

Every independent line of evidence gathered in this phase — container tags
(`avg_frame_rate`, `r_frame_rate`), the frame-count/duration derivation, the
real decoded-frame timestamps (both ffprobe's `best_effort_timestamp_time`
and OpenCV's `CAP_PROP_POS_MSEC`), the raw MOV sample table (`stts`, uniform
33.33ms deltas), the packet count, and AVA's own `timestampFps` evidence —
agree with each other and describe a genuinely, uniformly ~30 samples/sec
video stream. No edit-list retiming, no hidden/auxiliary video track, no
duplicate-frame padding, and no disagreement between any two measurement
methods was found anywhere in this file that would indicate 120fps
information is present but disguised or discarded-but-recoverable. This is
not the "metadata lies, timestamps tell the truth" pattern from the
previously-documented `vanni_fly_240` incident (R5A.1/R5A.2) — for this
file, every signal tells the same story.

## R5A.4.17 — Where the loss could have happened

### Proven (from bytes currently present, this phase)

- This exact MOV's video track contains exactly 86 genuinely distinct
  (non-duplicated) frames, uniformly spaced at ~33.33ms, with no edit-list
  retiming and no hidden video track.
- The file's `com.apple.quicktime.creationdate` matches its filesystem
  timestamp, consistent with (not proof of) being an unedited original
  camera export rather than a re-processed/re-exported copy.
- **The exact bytes AVA received and stored are identical to the exact
  bytes analyzed in this phase** (see R5A.4.18) — whatever is true of this
  file's frame content was already true at the moment of upload. AVA's own
  storage/preprocessing did not alter it (there is no separate transcode
  step between upload and pose-analysis storage in the traced pipeline —
  confirmed structurally in R5A.1/R5A.2, and now confirmed by direct byte
  comparison for this specific file).

### Not yet proven

- Whether the iPhone 16 camera hardware/OS itself wrote only 86 real
  frames for this recording despite a 120fps camera-app setting, versus
  writing more frames that were subsequently reduced before this file ever
  reached the Downloads folder.
- Which specific stage — if any reduction occurred outside AVA — was
  responsible: Photos app export/compression, AirDrop, Messages, cloud
  sync/download, Finder copy, or any other handling between the camera and
  the `Vanni Pt 2 files` folder. No evidence gathered in this phase
  distinguishes between "the camera never captured 120fps worth of frames
  for this take" and "a later export step silently reduced it" — both
  remain open possibilities.
- The exact meaning/implication of
  `com.apple.quicktime.full-frame-rate-playback-intent: 0` for this
  file's history is not established from this investigation alone.

**No stage is blamed.** This phase proves what the bytes currently contain
and proves AVA did not alter them after upload; it does not prove where, if
anywhere before upload, a reduction happened.

## R5A.4.18 — Comparison against the actual AVA-uploaded object

Read-only lookup against the local development Supabase instance (no
production system touched; no credentials changed; no write performed)
found an existing local session whose `original_filename = 'IMG_4849.mov'`:

```
session id:          0e5185f8-5b48-4d42-a232-5def54642c12
original_filename:    IMG_4849.mov
size_bytes:           4625111
fps:                   30
fps_classification:    experimental_30_fps_class
duration_s:            2.866667
width x height:        1820 x 1024
```

Every one of these values matches this phase's independent measurements of
`tmp/phaseR5/source-videos/IMG_4849.mov` exactly.

The underlying storage object was located on disk inside the local
Supabase Storage container (`sprint-videos/5df6454c-.../0e5185f8-....mov`)
and its SHA-256 was computed read-only:

```
62fd0e696a03a47354d82bce3789ab5f8ce7baf00376177f76bafc5919c147d6
```

**This is byte-for-byte identical** to the local forensic copy's hash
(`62fd0e69...c147d6`, R5A.4.1) and the original Downloads-folder file's hash
(prep-step completion report).

**Result: MATCH.** The file AVA actually received, stored, and fully
analyzed (`analyses` row: `status=complete, analysis_fps=30, source_fps=30`)
for this session is byte-identical to the file examined throughout this
entire phase. AVA's ingestion pipeline did not transcode, resample, or
otherwise alter the video between upload and storage.

## R5A.4.19 — Explaining the UI symptom

**Classification explanation** (why AVA *labels* it 30): `classify_fps()`
correctly applies its `experimental_30_fps_class` band to `detected≈30.0`
(the raw `avg_frame_rate`), and — unlike the R5A.1/R5A.2 hypothesis — this
is not a case of skipped corroboration producing a wrong answer: the
corroborating `timestampFps` evidence also reads ~30.0, so even a
classifier that *always* required timestamp corroboration would reach the
identical conclusion for this file. **The classification is correct given
the evidence in the file.**

**Media explanation** (why the file itself reports/contains what it does):
the file's video track genuinely, structurally contains only 86 uniformly-
spaced samples over 2.867 seconds — a real ~30fps stream at the MOV
sample-table level, not a mislabeled or disguised higher-rate stream.
**This is not the same bug as the `avg_frame_rate`-vs-timestamp-evidence
mismatch documented for the historical `vanni_fly_240` clip.** These two
explanations are, for this specific file, **the same underlying fact**
(genuinely ~30fps content) rather than two separate bugs — the
classification is a correct read of an actual ~30fps file, and the open
question is entirely about *how the file came to contain only 30fps worth
of frames* despite a 120fps camera setting, which is a question about
something outside AVA's own classification logic.

## Required Decision Tree

**Does the MOV contain ~120 unique temporal samples/sec?**

**NO** — proven by four independent, mutually-agreeing counting methods
(container tags, sample table, packet count, two independent decoders) and
confirmed by AVA's own real-timestamp evidence, which does not disagree
with the container tags for this file.

→ **The loss (if it is loss, rather than the camera never producing 120fps
worth of frames for this take) happened before AVA's classification logic
ever ran** — proven not to be inside AVA's storage/preprocessing (R5A.4.18
byte-identity), and not explainable as a classify_fps() corroboration gap
(R5A.4.14's timestamp evidence agrees with the container tags). Whether it
happened at capture, in-phone processing, or during export/transfer to the
Downloads folder is **UNKNOWN** — the exact missing evidence needed to
resolve that further would be either (a) the coach's original Photos-app
"info" view or a direct Photos-library export of this exact take (to see if
Photos itself reports 120fps for the source asset while this exported copy
shows 30fps, which would localize the loss to the export step), or (b) a
second, independently-obtained copy of the same take made through a
different export path, to compare against this one.

## Production Modification Guard

```
$ git status --short -- src scripts supabase
```
No changes beyond the pre-existing session baseline (same as every prior
R5A phase). Only `docs/r5a4-vanni-120fps-part2-source-metadata.md` and the
git-ignored `tmp/phaseR5/r5a4/*` diagnostic files were added. No `ffmpeg`
transcode, no MOV rewrite, and no database write of any kind was performed
— every DB/storage interaction in R5A.4.18 was a read-only `SELECT`/file
read against the local development instance.

---

### R5A.4 — Result

**PASS**

### Source

`IMG_4849.mov` — SHA-256 `62fd0e696a03a47354d82bce3789ab5f8ce7baf00376177f76bafc5919c147d6`

### User-confirmed capture setting

`120 FPS`

### Container-reported FPS

`avg_frame_rate = 30/1 = 30.0`, `r_frame_rate = 30/1 = 30.0` exactly.

### Actual decoded frames

**86** — confirmed identically by ffprobe frame enumeration, ffprobe packet count, MOV `stts`/`stsz` sample tables, and an independent full OpenCV decode loop.

### Timestamp-derived FPS

**30.0003 FPS** (median real inter-frame delta 33.333ms, effectively zero jitter) — from both ffprobe's `best_effort_timestamp_time` and OpenCV's `CAP_PROP_POS_MSEC`, in full agreement with each other and with the container tags.

### Unique temporal samples

86 frames, all pixel-hash-distinct (0 exact duplicates), uniformly spaced — genuinely 86 unique real-time samples across 2.867 seconds, not padding or duplication.

### QuickTime timing structure

Single-entry `stts` (86 samples, uniform 80-tick/33.33ms delta), flat 1:1 `elst` (`media_rate=1.0`, no retiming), no second video track. Direct atom-level proof there is no edit-list-based high-rate-to-low-rate retiming present.

### OpenCV behavior

Full agreement with ffprobe: 86 decoded frames, `CAP_PROP_FPS=30.0`, perfectly monotonic uniform timestamps, zero anomalies.

### AVA production classification

`classify_fps()` (real, unmodified) → `experimental_30_fps_class`, `analysisFps=30`, reason `average_rate_in_experimental_30_range` — and critically, AVA's own `timestampFps` evidence (30.0003) agrees with this, unlike the R5A.2 hypothesis scenario.

### Genuine 120 FPS information recoverable?

**NO**

### Why AVA shows 30 FPS

The file genuinely, structurally contains only ~30 unique samples/sec at the MOV sample-table level; AVA's classifier is reading this correctly, not being fooled by a metadata/timestamp disagreement.

### Where did the 120→30 conversion occur?

**MOST LIKELY**: before the file reached AVA (proven not to be inside AVA's own storage/preprocessing, via byte-identical comparison to the actually-uploaded/stored object). **UNKNOWN** exactly which pre-upload stage (camera capture itself vs. an export/transfer step) — not proven, evidence insufficient to localize further within this phase's scope.

### AVA-uploaded object comparison

**MATCH** — SHA-256 of the object stored in local Supabase Storage for the existing `IMG_4849.mov` session is byte-identical to the forensic copy analyzed throughout this phase.

### Files added

`docs/r5a4-vanni-120fps-part2-source-metadata.md`, `tmp/phaseR5/r5a4/*` (git-ignored raw diagnostics: `format-streams-full.json`, `frames-4849.json`, `packets-4849.json`, `atom-walk-4849.json`, `mov-timing-tables-4849.json`, `mov_atom_walk.py`, `ava-production-probe-4849.txt`)

### Production files changed

`NONE`

### Next phase

`R5A.5 — Inspect Vanni 240 FPS Part 2 source metadata`

Not started, per instruction.

---

**Current prompt:** `R5A.4`
**Prompt status:** `COMPLETE`
**Completed micro-tasks:** `4 / 197`
**R5 completion:** `2.03%`
