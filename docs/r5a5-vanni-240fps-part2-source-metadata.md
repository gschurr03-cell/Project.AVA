# R5A.5 — Full Forensic Analysis of Vanni 240 FPS Part 2 (`IMG_4850.mov`)

Continuation of R5A.1–R5A.4 (all kept immutable). Investigation only — no
production code, database, or source file was modified. Raw diagnostic
output lives in `tmp/phaseR5/r5a5/` (git-ignored). USER-CONFIRMED CAPTURE
RATE for this file is **240 FPS** — never adjusted below regardless of what
any tool reports.

## R5A.5.1 — Source identity

- Path: `/Users/imac/Projects/Project.AVA/tmp/phaseR5/source-videos/IMG_4850.mov`
- Size: 3,981,630 bytes; mtime: Aug 11 18:38:02 2026
- SHA-256: `25ed7338d5a19396ebbd910b28e0f5e0f6eb4f0ea3aaab79157c2dd1f41073de`
- Matches the hash recorded during the R5A prep step exactly, and matches the original `Downloads/Vanni Pt 2 files/IMG_4850.mov` byte-for-byte.
- `git check-ignore -v` confirms `.gitignore:33 /tmp/` covers it; `git status --short` shows nothing trackable.

## R5A.5.2 — Container stream enumeration

4 streams (`tmp/phaseR5/r5a5/format-streams-full.json`):

| Index | Type | Codec | Handler | Duration | `nb_frames` |
| --- | --- | --- | --- | --- | --- |
| 0 | video | hevc (Main, level 120), yuvj420p | Core Media Video | 2.666667 s | 80 |
| 1 | audio | aac (LC) | Core Media Audio | 2.582333 s | 124 |
| 2 | audio | (unspecified) | Core Media Audio | 2.645000 s | 126 |
| 3 | data | — | Core Media Metadata | 2.645000 s (stream-level) | 1 |

Same track topology as `IMG_4849.mov` — 1 video, 2 audio, 1 metadata track. No second video track, no hidden auxiliary video stream.

## R5A.5.3 — Container metadata

```
major_brand: "qt  "
creation_time: 2026-08-12T03:07:48.000000Z
com.apple.quicktime.make: Apple
com.apple.quicktime.model: iPhone 16
com.apple.quicktime.software: 26.5.2
com.apple.quicktime.creationdate: 2026-08-11T18:38:02-0600
com.apple.quicktime.full-frame-rate-playback-intent: 0
com.apple.quicktime.location.ISO6709: +39.9910-105.1036+1604.354/
```

`creationdate` matches the file's own filesystem mtime exactly — consistent
with an unedited original camera file. Same `full-frame-rate-playback-intent: 0`
key present as in `IMG_4849.mov` — reported as a data point, not interpreted.

## R5A.5.4 — Primary video stream metadata

| Field | Value |
| --- | --- |
| codec | hevc, profile Main, level 120 |
| pix_fmt | yuvj420p |
| width × height | 1680 × 946 (coded: 1680×960) |
| `r_frame_rate` | `30/1` = 30.0 exactly |
| `avg_frame_rate` | `30/1` = 30.0 exactly |
| `time_base` | `1/2400` |
| `duration_ts` / `duration` | 6400 / 2.666667 s |
| `nb_frames` | 80 |
| `bit_rate` | 11,440,485 bps |
| rotation | `-180°` |

## R5A.5.5/5.6 — Full frame enumeration and exact count

`ffprobe -show_frames` (full dump: `tmp/phaseR5/r5a5/frames-4850.json`): **exactly 80 decoded frames.**

| Method | Count |
| --- | --- |
| ffprobe `nb_frames` | 80 |
| ffprobe `-show_frames` | 80 |
| ffprobe `-show_packets` | 80 |
| MOV `stts` sample table | 80 (single entry: `sample_count=80, sample_delta=80`) |
| MOV `stsz` | 80 |
| OpenCV `.read()` loop | 80 |
| OpenCV `CAP_PROP_FRAME_COUNT` | 80 |

Theoretical counts for the measured 2.666667 s duration: **30fps → 80.00,
60fps → 160.00, 120fps → 320.00, 240fps → 640.00.** The file contains 80
frames — exactly the 30fps figure, not 160/320/640.

## R5A.5.7 — Timestamp delta analysis

79 deltas from `best_effort_timestamp_time`:

| Statistic | Value |
| --- | --- |
| median | 33.3330 ms |
| mean | 33.3333 ms |
| min / max | 33.3330 ms / 33.3340 ms |
| stdev | 0.00047 ms (effectively zero) |
| deltas within 1ms of 33.333ms (30fps) | **79 / 79** |
| deltas within 1ms of 16.667ms (60fps) | 0 / 79 |
| deltas within 1ms of 8.333ms (120fps) | 0 / 79 |
| deltas within 1ms of 4.167ms (240fps) | 0 / 79 |

A perfectly uniform 30.0003 fps signal, matching `IMG_4849.mov`'s pattern exactly in character.

## R5A.5.8 — Frame uniqueness

Full-frame SHA-256 across all 80 OpenCV-decoded frames: **0 exact duplicate
adjacent frames; all 80 hashes unique.** Consecutive mean absolute pixel
difference: min 0.388, max 1.285, mean 0.699 (0–255 scale) — comparable
magnitude to `IMG_4849.mov`, consistent with a similar wide-shot,
mostly-static-background sprint recording. No systematic duplication found.

## R5A.5.9 — Packet count

Video packets: **80** — identical to decoded-frame count and `stts`/`stsz`
sample counts. No hidden encoded samples.

## R5A.5.10 — MOV sample-table inspection

Video track (track index 0), direct atom parsing (`tmp/phaseR5/r5a5/mov-timing-tables-4850.json`):

```
mdhd:  timescale=2400, duration=6400 ticks (= 2.666667 s)
stts:  1 entry -> {sample_count: 80, sample_delta: 80}  (80/2400 = 33.333ms, uniform)
stsz:  sample_count=80
stsc:  6 entries (chunk layout — not rate-diagnostic)
stco:  6 chunks
elst:  1 entry -> {segment_duration: 128000 (movie timescale 48000 = 2.666667s),
       media_time: 0, media_rate: 1.0}
```

Same finding as `IMG_4849.mov`: a flat, unstretched, single-segment,
`media_rate=1.0` edit list, and a uniformly-spaced single-entry `stts`. **No
edit-list retiming present.** The sample table itself — not merely a
summary tag — directly encodes 80 genuinely uniform 33.33ms-spaced samples.

## R5A.5.11 — High-speed/slow-motion representation search

Same as `IMG_4849.mov`: `com.apple.quicktime.full-frame-rate-playback-intent: 0`
is present at the format level (evidence connecting this file to Apple's
HFR capture pathway, semantics not independently verified). No dedicated
slow-motion/capture-rate timed-metadata key was found. The auxiliary
"Core Media Metadata" track (track index 3) has its own `mdhd`:
`timescale=2400, duration=28360` ticks = **11.8167 seconds** — longer than
the visible 2.667s clip, sliced by a (still 1:1-rate) `elst`
(`media_time=22012` ticks ≈ 9.17s offset, `segment_duration` ≈ 2.645s,
`media_rate=1.0`) — the same structural pattern observed in `IMG_4849.mov`'s
metadata track (there: 14.72s underlying / 2.867s visible). Not decoded
further (44-byte payload, schema not identified) — flagged, not pursued, as
in R5A.4.

**Evidence the camera was set to 240fps** (the `full-frame-rate-playback-intent`
key, the iPhone 16/software tags, user confirmation) is present. **Evidence
of 240 actual unique frames in this MOV** is not — these are explicitly
different questions, and this section answers only the latter: no.

## R5A.5.12/5.13 — OpenCV full decode and comparison

Full `.read()` loop: **80 successful decodes**, matching declared count.
`CAP_PROP_POS_MSEC`: perfectly monotonic, uniform 33.333ms spacing (stdev
~1.8×10⁻¹³ ms), exactly one zero timestamp, zero anomalies.

| Measurement | FFmpeg/FFprobe | OpenCV |
| --- | --- | --- |
| Declared FPS | 30.0 (`avg`/`r_frame_rate`) | `CAP_PROP_FPS`=30.0 |
| Frame count | `nb_frames`=80 | `CAP_PROP_FRAME_COUNT`=80 |
| Decoded count | 80 | 80 |
| Median timestamp delta | 33.333 ms | 33.333 ms |
| Effective FPS | 30.0003 | 30.0 |

No disagreement between the two decoders.

## R5A.5.14 — AVA's actual, unmodified production probe

```json
{
  "averageFps": 30.0,
  "nominalFps": 30.0,
  "realFps": 29.99999625000047,
  "timestampFps": 30.00030000299998,
  "variableFrameRate": false,
  "durationSeconds": 2.666667,
  "frameCount": 80
}
```

`classify_fps()` → **`classification = "experimental_30_fps_class"`**,
**`reason = "average_rate_in_experimental_30_range"`**,
**`tier_analysis_fps = 30`**.

As with `IMG_4849.mov`: `timestampFps` (30.0003) agrees with `averageFps`
(30.0) — no metadata-vs-real-timestamp disagreement exists in this file for
corroboration logic to have missed. AVA's classifier is reading this file
correctly relative to what it actually contains.

## R5A.5.15 — Reproducing AVA's actual current outcome (read-only DB lookup)

A real, existing local session matches `original_filename = 'IMG_4850.mov'`:

```
session id:          47dba969-67fe-4182-b895-e5e7259761f9
size_bytes:           3981630
sessions.fps:          30
sessions.fps_classification: experimental_30_fps_class
duration_s:            2.666667
width x height:        1680 x 946
```

`analyses` row for this session: `status=complete, analysis_fps=30, source_fps=30, completed_at=2026-08-12 03:20:54`.

**Every predicted value from R5A.5.14's standalone probe matches the actual persisted database state exactly.**

## R5A.5.16 — `analysis_timestamp_ms` observation count

`classification = "experimental_30_fps_class"` is a member of
`NATIVE_RATE_FPS_CLASSES` (same mechanism as R5A.4 §15), so
`analysis_timestamp_ms` = real `cv2.CAP_PROP_POS_MSEC`-derived timestamps —
per R5A.5.12, a clean uniform 33.333ms series. **AVA receives exactly 80
timestamped observations for this file, not 160, 320, or 640.**

## R5A.5.17 — 240 FPS recoverability

> Does this exact MOV contain enough temporal information for genuine 240 FPS analysis?

**NO.** Identical evidentiary basis to R5A.4's conclusion for the 120fps
file: every independent measurement (container tags, sample table, packet
count, two independent decoders, AVA's own timestamp evidence) agrees on a
genuinely uniform ~30 samples/sec stream. No edit-list retiming, no hidden
video track, no duplicate-frame padding, no cross-method disagreement.

## R5A.5.18 — Investigating the reported 240→60 symptom

The user's original report described the 240 FPS recording appearing in
AVA as **~60 FPS**. This phase's direct, read-only inspection of the actual
persisted database row for this exact file's session shows:

```
sessions.fps = 30          (NOT 60)
sessions.fps_classification = experimental_30_fps_class   (NOT validated_60_fps_class)
```

**The evidence is not forced to fit the earlier report.** For this exact
current session and this exact current file, AVA shows **30**, not 60. The
originally-reported "~60" observation does not reproduce here. Two
possibilities are left open, and neither is favored without further
evidence: (a) the original "~60" observation was made against a different
upload/session than this one (a prior attempt, a different export of the
same take, or a different recording entirely), or (b) something about this
specific `Vanni Pt 2` copy of the file differs from whatever was originally
observed producing "~60". This phase cannot distinguish between these from
the evidence gathered — it can only report, with certainty, what the
*current* file and *current* session actually show.

## R5A.5.19 — AVA-stored object comparison

The actual storage object for session `47dba969-...` was located (read-only)
on the local Supabase Storage volume:

```
/mnt/stub/stub/sprint-videos/5df6454c-.../47dba969-....mov/fd2a0608-...
SHA-256: 25ed7338d5a19396ebbd910b28e0f5e0f6eb4f0ea3aaab79157c2dd1f41073de
```

**Byte-identical** to the forensic copy analyzed throughout this phase and
to the original Downloads-folder file.

**Result: MATCH.**

## R5A.5.20 — Where temporal reduction occurred

### Proven
- The video track's sample table (`stts`) directly encodes 80 genuinely uniform, non-duplicated 33.33ms-spaced samples — not a metadata label disguising more real samples.
- The exact bytes AVA stored and fully analyzed are byte-identical to the file examined here (R5A.5.19) — AVA's own storage/preprocessing did not alter this file.
- `sessions.fps`/`analyses.analysis_fps`/`analyses.source_fps` are all `30`, consistent end-to-end with the file's actual content.

### Most likely
- Given R5A.4's identical finding for the 120fps file, and the structural match documented in R5A.5.21 below, **a common pre-upload stage most likely affected both the 120fps and 240fps takes the same way** — but which specific stage (camera capture behavior, Photos handling, export, transfer) remains unproven.

### Unknown
- The exact stage of loss remains unestablished, as in R5A.4. The same missing-evidence path applies (a Photos-app "info" view of the original asset, or a differently-exported copy of the same take, would help localize this further).

## R5A.5.21 — Cross-check against R5A.4 (and the 60fps control)

| Property | `IMG_4849.mov` (120fps-confirmed) | `IMG_4850.mov` (240fps-confirmed) | `IMG_4848.mov` (60fps-confirmed, working control) |
| --- | --- | --- | --- |
| Codec | hevc, Main, level 120 | hevc, Main, level 120 | hevc |
| `avg_frame_rate`/`r_frame_rate` | 30/1 | 30/1 | ~60.185 / 60.0 |
| Video `time_base` / `mdhd` timescale | 1/2400 | 1/2400 | **1/600** (different) |
| `stts` structure | 1 entry, uniform delta=80 ticks | 1 entry, uniform delta=80 ticks | **4 entries, naturally varying deltas** (4, 10, 11, 10 ticks) |
| `elst` | flat 1:1, `media_time=0`, whole-media segment | flat 1:1, `media_time=0`, whole-media segment | flat 1:1, `media_time=0`, whole-media segment |
| `full-frame-rate-playback-intent` | 0 | 0 | (not checked this phase — outside R5A.3's minimal scope; not re-opened here) |
| Frame count vs duration | 86 = 2.867×30 exactly | 80 = 2.667×30 exactly | 163 ≈ 2.708×60.18 (not a clean ×30) |
| Exact duplicate frames | 0/86 | 0/80 | (not checked — 60fps control was not duplicate-tested; out of scope) |

**Were both the 120 and 240 files converted into essentially the same 30fps
MOV representation?** **Yes — structurally, near-identically.** Both share
the identical unusual `2400` media timescale, the identical single-entry
perfectly-uniform `stts` pattern (in sharp contrast to the 60fps control's
naturally-varying 4-entry `stts`), the identical flat 1:1 edit list, and the
identical `full-frame-rate-playback-intent: 0` tag. The 60fps control file
has a *different* timescale (600, not 2400) and a *naturally irregular*
sample table consistent with genuine real-time camera capture jitter — a
qualitatively different structural fingerprint. This is strong
circumstantial evidence that whatever process produced the current
`IMG_4849.mov` and `IMG_4850.mov` files treated both high-speed recordings
through the same pathway, distinct from how the 60fps recording was
produced/handled — **but this is a structural correlation, not proof of
which specific stage did it.** No conclusion beyond that correlation is
drawn here; the broader systematic cross-file analysis is explicitly
R5A.6's scope, not repeated in full here.

## Required Decision

**REDUCED TO 30**

The file contains approximately 30 (exactly 30.0003) unique temporal
samples/sec, confirmed by every independent measurement method available in
this investigation, with no evidence of hidden higher-rate data, edit-list
retiming, or an intermediate ~60fps representation.

## Production Modification Guard

```
$ git status --short -- src scripts supabase
```
No changes beyond the pre-existing session baseline. Only
`docs/r5a5-vanni-240fps-part2-source-metadata.md` and git-ignored
`tmp/phaseR5/r5a5/*` diagnostics were added. No transcode, no MOV rewrite,
no database write — all DB/storage interaction was read-only.

---

### R5A.5 — Result

**PASS**

### Source

`IMG_4850.mov` — SHA-256 `25ed7338d5a19396ebbd910b28e0f5e0f6eb4f0ea3aaab79157c2dd1f41073de`

### User-confirmed capture setting

`240 FPS`

### Container-reported FPS

`avg_frame_rate = r_frame_rate = 30/1 = 30.0` exactly.

### Actual decoded frames

**80** — confirmed identically across ffprobe frame/packet enumeration, MOV `stts`/`stsz` sample tables, and an independent full OpenCV decode.

### Timestamp-derived FPS

**30.0003 FPS**, effectively zero jitter — from both ffprobe and OpenCV, in full agreement with the container tags and with each other.

### Unique temporal samples

80 frames, all pixel-hash-distinct (zero exact duplicates), uniformly spaced 33.33ms apart.

### MOV timing structure

Single-entry uniform `stts` (80 samples, 33.33ms delta), flat 1:1 `elst` (no retiming), no second video track — structurally near-identical to `IMG_4849.mov`.

### OpenCV behavior

Full agreement with ffprobe: 80 frames, `CAP_PROP_FPS=30.0`, perfectly monotonic timestamps, zero anomalies.

### AVA production classification

`classify_fps()` (real, unmodified) → `experimental_30_fps_class`, `analysisFps=30`; `timestampFps` evidence agrees with the container tags — no corroboration-gap mechanism at play for this file.

### Current DB/UI FPS

`sessions.fps = 30`, `fps_classification = experimental_30_fps_class`, `analyses.analysis_fps = 30`, `analyses.source_fps = 30` — read directly from the actual local session's database rows.

### Genuine 240 FPS information recoverable?

**NO**

### 240 → 60 report

**Does not reproduce for this exact file/session.** The current, actual persisted state is 30, not 60. The originally-reported "~60" observation is not explained by this file's current evidence; whether it reflects a different upload/session or something else is unresolved and explicitly not guessed at.

### Final temporal classification

**REDUCED TO 30**

### Where did temporal reduction occur?

**MOST LIKELY** before the file reached AVA (proven not inside AVA's storage, via byte-identical comparison). **UNKNOWN** which specific pre-upload stage.

### AVA-uploaded object

**MATCH**

### R5A.4 comparison

**Yes** — `IMG_4849.mov` and `IMG_4850.mov` show a near-identical structural reduction pattern (same unusual 2400 media timescale, same single-entry perfectly-uniform `stts`, same flat edit list, same Apple HFR-related tag), qualitatively distinct from the 60fps control's naturally-varying sample table and different timescale — a strong structural correlation suggesting a common pre-upload pathway affected both high-speed files, though the specific stage remains unproven.

### Files added

`docs/r5a5-vanni-240fps-part2-source-metadata.md`, plus git-ignored raw diagnostics under `tmp/phaseR5/r5a5/`.

### Production files changed

`NONE`

### Next phase

`R5A.6 — Compare container FPS against actual timestamps across the Vanni Part 2 set`

Not started, per instruction.

---

**Current prompt:** `R5A.5`
**Prompt status:** `COMPLETE`
**Completed micro-tasks:** `5 / 197`
**R5 completion:** `2.54%`
