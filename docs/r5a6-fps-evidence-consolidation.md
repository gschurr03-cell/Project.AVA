# R5A.6 — Cross-File FPS Evidence Consolidation & Decision Gate

Continuation of R5A.1–R5A.5 (all kept immutable) plus the subsequent
read-only high-FPS transfer control experiments. This phase does not add
new forensic probes — it consolidates what's already been proven, makes an
explicit decision about the FPS classifier's launch-blocker status, and
checks one new piece of real evidence (IMG_4848's actual stored pose
artifact) against the Vanni skeleton/tracking symptom, since that
comparison had not yet been made against real data.

## R5A.6.1 — Final FPS evidence matrix

| | `IMG_4848` (60fps control) | `IMG_4849` first export | `IMG_4849` fresh/current export | `IMG_4850` first export | `IMG_4850` fresh export |
| --- | --- | --- | --- | --- | --- |
| User-intended capture | 60 FPS | 120 FPS | 120 FPS | 240 FPS | 240 FPS |
| iPhone Photos observed source FPS | not queried | **119.94** | 119.94 | **180.16** | 180.16 |
| SHA-256 | (not part of this cross-file matrix; see R5A.3) | `62fd0e69...c147d6` | `9ea42fd9...286ccd491` | `25ed7338...41073de` | `4da1d1b8...8dfe7` |
| Resolution | 1806×1016 | 1820×1016 | 1918×1078 | 1680×946 | 1918×1080 |
| Duration | 2.708333 s | 2.866667 s | 2.866667 s | 2.666667 s | 2.666667 s |
| Container `avg`/`r_frame_rate` | ~60.185 / 60.0 | 30/1 | 30/1 | 30/1 | 30/1 |
| Decoded frames | 163 | 86 | 86 | 80 | 80 |
| Unique frames | (not tested) | 86/86 | 86/86 | 80/80 | 80/80 |
| Median timestamp delta | ~16.667 ms | 33.333 ms | 33.333 ms | 33.333 ms | 33.333 ms |
| Timestamp-derived FPS | 59.999 | 30.0003 | 30.0003 | 30.0003 | 30.0003 |
| Media timescale (`mdhd`) | 600 | 2400 | 2400 | 2400 | 2400 |
| `stts` structure | 4 entries, naturally varying (4,10,11,10-tick deltas) | 1 entry, uniform (80-tick delta) | 1 entry, uniform | 1 entry, uniform (80-tick delta) | 1 entry, uniform |
| AVA production classification | `validated_60_fps_class` | `experimental_30_fps_class` | (same file, not re-classified separately) | `experimental_30_fps_class` | `experimental_30_fps_class` |
| AVA storage hash relationship | not compared this cross-file (see R5A.4 for 4849) | byte-identical to actual stored object (R5A.4) | not uploaded to AVA (control-only) | byte-identical to actual stored object (R5A.5) | not uploaded to AVA (control-only) |

**Camera/source asset observation** (what iPhone Photos reports for the
original, un-exported asset — 119.94 and 180.16 FPS) is a claim about an
asset this investigation has never directly measured bytes of; it is
user-reported Photos-app metadata, not something ffprobe/OpenCV touched.

**Actual MOV bytes available to AVA** (every exported/downloaded/AirDropped
copy examined in R5A.3–R5A.5 and the subsequent control experiments) is
something this investigation measured directly, repeatedly, by four
independent methods each time (container tags, sample tables, packet
counts, two independent decoders) — and it consistently shows ~30 FPS for
every copy of the 119.94fps and 180.16fps sources tested so far, across
multiple independently-obtained exports with different bytes, different
resolutions, and one attempt via Format→Current→AirDrop specifically.

## R5A.6.2 — Reconciling the R5A.1/R5A.2 hypothesis with real evidence

R5A.1/R5A.2's static-code finding is real and unchanged: `classify_fps()`'s
`validated_60_fps_class`/`experimental_30_fps_class` branches accept
`avg_frame_rate` without first requiring timestamp corroboration. That
architectural gap still exists in the code today.

But R5A.4/R5A.5 directly measured, for every real Vanni file examined:

- `IMG_4848`: `avg_frame_rate` ≈ 60.185, `timestampFps` ≈ 59.999 — agree.
- `IMG_4849` (every export): `avg_frame_rate` = 30.0, `timestampFps` ≈ 30.0003 — agree.
- `IMG_4850` (every export): `avg_frame_rate` = 30.0, `timestampFps` ≈ 30.0003 — agree.

> Is there any real Vanni Part 2 file currently demonstrating that AVA's
> classifier produces the wrong classification for the temporal samples
> actually present in the uploaded MOV?

**`NO`**

In every real file tested, `classify_fps()`'s output matches what the
file's own real, decoded-timestamp evidence says. The classifier is not
observed to be wrong about any of these files' actual content — it is
architecturally capable of being fooled by a metadata/timestamp
disagreement (as the pre-existing `vanni_fly_240` incident documented in
R5A.1/R5A.2 shows can happen for *some* file), but no currently-available
Vanni Part 2 file demonstrates that failure mode.

## R5A.6.3 — Three distinct FPS concepts

**A. Intended camera capture setting** — what the user selected on the
phone: 60 / 120 / 240. Not measurable from any file; it's a statement of
intent.

**B. Source asset observed FPS** — what iPhone Photos reports for the
original, unexported asset: 119.94 for `IMG_4849`, 180.16 for `IMG_4850`.
This is the phone's own report about its own stored asset — closer to
ground truth than any exported copy, but still not something this
investigation has independently measured with `ffprobe`/OpenCV, since the
original asset never left the phone in an inspectable form.

**C. Uploaded media temporal sample rate** — what the actual MOV bytes
AVA (or this investigation) receives and can decode contain: measured,
repeatedly, directly, as ~30 FPS for both high-rate sources across every
export tested.

AVA must not silently pretend C equals A or B when the bytes don't support
it, because: (1) A is unverifiable intent — treating it as truth would mean
trusting a label with zero evidence behind it; (2) B is a second-hand
report from a system (Photos) this investigation cannot directly query for
the *exported* file, only the original asset — by the time a file reaches
AVA, B may no longer describe what's actually being analyzed; (3) only C is
something AVA (or any tool) can ever actually measure from the bytes it's
given, and C is the only one of the three that determines what physics AVA
can legitimately claim to measure. Displaying a 120fps or 240fps label on
an analysis actually computed from 30fps-spaced samples would be a false
precision claim — exactly the kind of thing `docs/accuracy-manifesto.md`
exists to prevent.

## R5A.6.4 — Did AVA destroy high-rate temporal data?

> Is there evidence AVA upload, storage, or analysis destroyed the 120/180 FPS temporal samples?

**`NOT SUPPORTED`**

Evidence against AVA causation, all established in R5A.4/R5A.5 and
reconfirmed here:
- Every local, pre-upload probe of `IMG_4849`/`IMG_4850` copies (run entirely
  outside AVA, before any upload) already showed ~30fps content.
- The actual objects stored in AVA's storage backend were retrieved
  read-only and their SHA-256 hashes are byte-identical to the exact files
  examined pre-upload — AVA's ingestion pipeline did not transcode or alter
  either file.
- A completely independent redownload (different bytes, different
  resolution, different export pass) of the same original assets reproduced
  the identical ~30fps content, before ever touching AVA.

No evidence anywhere in this investigation shows AVA converting more frames
into fewer. Every reduction observed was already present in the bytes
before AVA received them.

## R5A.6.5 — Where the current temporal loss occurs

| Stage | What we know | Classification |
| --- | --- | --- |
| Camera/source capture | The user set the camera to 120/240fps. Whether the sensor/encoder actually wrote that many real frames for these specific takes was never directly observed — the earliest artifact examined is already an exported file. | **UNKNOWN** |
| iPhone Photos source asset | User reports Photos itself shows 119.94/180.16 FPS for the original assets. This investigation has not independently probed the original, unexported asset's bytes. | **UNKNOWN** (relies on user report, not independently measured) |
| Photos/export/AirDrop pathway | Multiple independent export attempts (original download, a fresh redownload with different bytes/resolution, and an explicit Format→Current→AirDrop attempt) all produced ~30fps content. Two of these attempts used different export settings/resolutions yet converged on the identical structural fingerprint (2400 media timescale, uniform single-entry `stts`). | **STRONGLY SUPPORTED** as at least *a* point where the reduction is present, though *not proven* to be where it originates versus merely reflecting an already-reduced source asset |
| Mac local file | Every local file examined, independent of AVA, is ~30fps. Directly measured, repeatedly. | **PROVEN** (for the specific files examined) |
| AVA upload/storage | Byte-identical comparison between local pre-upload files and actual AVA-stored objects, for both `IMG_4849` and `IMG_4850`. | **PROVEN** not to alter the files |
| AVA analysis | Classification correctly reflects the ~30fps content actually present; no evidence of AVA-side frame-dropping during pose extraction (frame counts consumed match what's in the file). | **PROVEN** to correctly process what it receives, for these files |

The strongest evidence-supported boundary: **the reduction is present by
the time any Mac-accessible copy of these files exists, and is proven not
to occur inside AVA.** Whether it originates at capture or somewhere in
Apple's Photos/export pipeline before the file becomes Mac-accessible
remains genuinely unresolved — this investigation does not claim to have
identified Apple's internal mechanism, only that AVA is not it.

## R5A.6.6 — Is the FPS classifier still a launch blocker?

**`NO`**

The architectural gap identified in R5A.1/R5A.2 (branch-3/5 accepting
`avg_frame_rate` without corroboration) remains real code, but zero
currently-available real-world files demonstrate it producing an incorrect
result. There is no evidence today that fixing it would change any Vanni
Part 2 outcome, because every tested file's `avg_frame_rate` and real
timestamp evidence already agree.

Classification: **defensive hardening** and **future regression coverage**
(both apply). It is legitimate, worthwhile work — a file where metadata and
timestamps genuinely disagree could exist in the future, as the historical
`vanni_fly_240` incident already proved once — but it is not blocking
anything currently observed, and should not consume further R5A investment
ahead of the tracking failure established below.

## R5A.6.7 — Future product-level FPS requirement (conceptual only)

Even with AVA behaving correctly, a coach who selected 120fps on their
phone and sees "30 FPS" in AVA has a legitimate confusion, because the
*claimed/intended capture FPS* (A) and *verified media FPS* (C) genuinely
differ for these files — and AVA currently only ever surfaces C. Future
product work (not implemented here) should likely:

- Always display **verified media FPS** (C), never the claimed/intended
  rate, since C is the only one AVA can actually stand behind.
- Detect and warn when the delivered file's temporal rate is materially
  lower than what a reasonable capture-rate label on the file/device would
  suggest, rather than silently accepting it.
- Provide user-facing guidance that the *original, high-rate file* — not a
  Photos-exported/AirDropped copy — needs to reach AVA if high-speed
  analysis is wanted, once (and if) the export pathway is confirmed as
  where the reduction happens.
- Never present a 30fps-derived analysis under a "120 FPS" or "240 FPS"
  banner — this is exactly the kind of overclaim the accuracy manifesto
  prohibits.

No UI change is made in this phase.

## R5A.6.8 — Does FPS explain the Vanni skeleton/contact failure?

**New evidence gathered this phase**: `IMG_4848` (the genuine ~60fps
control, correctly classified `validated_60_fps_class`) has a completed
AVA analysis (`session dcad7ae9-...`, `analysis 253824e4-...`). Its actual
stored pose artifact was retrieved read-only from local storage and
inspected directly:

- 163 total frames in the artifact (matching R5A.3's frame count exactly).
- **Pose (keypoints) is missing on 55 of 163 frames — 33.7% of the clip.**
- `trackState` distribution: `tracking`=136, `reacquiring`=23, `verified`=4
  — 23 frames spent actively re-acquiring a lost track.
- The largest gap: **frames 61–104, 44 consecutive frames with no detected
  pose at all — roughly 717ms, spanning t≈1007ms to t≈1723ms of the
  2.69-second clip** (over a quarter of the whole recording). Two smaller
  gaps also present (frames 0–4 at the very start; frames 110–114 and 121
  later).
- `trackingConfidence` ranges from 0.000 to 0.999, mean 0.570 — a wide,
  unstable spread consistent with intermittent tracking rather than
  uniformly solid detection.
- The stored `analyses.metrics` for this session are mostly `null`
  (`topSpeedMps`, `flightTimeMs`, `avgStrideLengthM`,
  `peakKneeFlexionDeg`, `groundContactTimeMs` all null; only
  `strideFrequencyHz: 2.92` is populated) — consistent with a result
  degraded by the tracking gaps just described, not a clean, fully-populated
  analysis.

> Do the skeleton/contact failures still exist on the valid 60 FPS Vanni file?

**YES.**

**FPS classification cannot be the root cause of the entire Vanni
tracking/contact failure, because the problem reproduces on correctly
classified 60 FPS footage** — `IMG_4848` has accurate FPS detection, real
usable 60fps timestamps, and zero FPS-related eligibility issues, yet still
loses pose tracking for over a third of its frames including one
uninterrupted 717ms gap. This is a real, measured, non-speculative finding
from the actual stored analysis artifact — not an inference.

## R5A.6.9 — Can tracking investigation proceed on IMG_4848?

**`YES`**

`IMG_4848` provides a clean debugging control because: its FPS is correctly
classified and matches real timestamp evidence (R5A.3); it has genuine,
usable per-frame timing (60fps, no retiming, no VFR concerns); the athlete
traverses the analysis zone in frame; and — as just established — it
already exhibits the exact class of symptom under investigation (pose loss,
reacquisition cycles, a long mid-clip gap) with FPS entirely ruled out as a
contributing variable. Any tracking/skeleton investigation that starts here
does not need to first untangle FPS effects from tracking effects, since
FPS is proven correct and controlled for.

## R5A.6.10 — Updated hypothesis table

| Hypothesis | Status | Evidence |
| --- | --- | --- |
| H1: AVA converts 120fps uploads to 30fps | **REFUTED** | Byte-identical pre/post-upload comparison (R5A.4); local pre-upload copies already show 30fps before any AVA contact. |
| H2: AVA converts high-rate uploads to 60fps | **REFUTED** | No tested file shows AVA producing 60fps from higher-rate input; `IMG_4850`'s actual current session shows 30, not 60 (R5A.5 §18), and the file was already 30fps pre-upload. |
| H3: AVA misclassifies these Vanni files by ignoring timestamp evidence | **REFUTED** (for all files tested) | R5A.4.14/R5A.5.14: `timestampFps` agrees with `averageFps` for every real file examined — no corroboration-gap failure observed. |
| H4: High-rate samples exist in the uploaded MOV but AVA fails to decode them | **REFUTED** | ffprobe, OpenCV, and MOV sample-table (`stts`) counts all agree exactly (86/80 frames) — nothing is being left undecoded. |
| H5: High-rate temporal information is absent before AVA receives the tested MOVs | **STRONGLY SUPPORTED** | Every pre-upload local probe (multiple independent exports) shows ~30fps content already present before any AVA interaction. |
| H6: The iPhone source asset retains/reports high-rate information before export | **UNPROVEN** (user-reported only) | Photos app reports 119.94/180.16 FPS per the user; not independently verified against the original asset's own bytes in this investigation. |
| H7: The tested Photos/export/AirDrop pathway produces a reduced 30fps derivative for these assets | **STRONGLY SUPPORTED** | Three independent export attempts (original, fresh redownload, explicit Format→Current→AirDrop) all produced ~30fps content with a shared, distinctive structural fingerprint. |
| H8: Wrong FPS classification is the primary cause of Vanni's skeleton/contact failures | **REFUTED** | The failure reproduces in full on `IMG_4848`, which has correct FPS classification and genuine, verified 60fps data. |
| H9: Tracking/contact failures can be reproduced and investigated independently on the valid 60fps Vanni control | **SUPPORTED** | Directly confirmed via `IMG_4848`'s actual stored pose artifact: 55/163 frames missing pose, a 44-frame contiguous gap, 23 reacquisition-state frames. |

## R5A.6.11 — Remaining R5A scope decision

**Option B: replace classifier repair with small future defensive-hardening/fixture tasks and move the critical path to athlete tracking.**

No real-world evidence currently justifies prioritizing classifier repair —
H1–H4 are all refuted, and H8 is refuted specifically because the tracking
failure reproduces without any FPS involvement at all. Continuing to invest
R5A phases into the classifier (Option A) would be solving a problem with
no demonstrated real-world instance, while the actual field-blocking issue
(skeleton/contact tracking loss) sits fully exposed and reproducible on a
clean control file, uninvestigated.

## R5A.6.12 — Next official micro-task

**`R5B.1 — Frame-by-frame athlete tracking and pose-loss forensic audit on IMG_4848 (Vanni 60 FPS control)`**

Scope to be defined when that phase begins; per this phase's evidence it
should eventually establish, using `IMG_4848`'s actual stored pose artifact
and (if needed) a fresh read-only re-run of the pose backend: every decoded
frame's athlete bounding-box/ROI behavior, pose presence, skeleton
confidence, selected-athlete identity, candidate tracks, track-switching
events, missed detections, reacquisition behavior — specifically explaining
the frames 61–104 gap and the other two gaps found here — and whether the
athlete remains visually present in the source video during the frames
where detection fails. **Not started in this phase.**

## Production Modification Guard

```
$ git status --short -- src scripts supabase
```
No changes beyond the pre-existing session baseline. Only
`docs/r5a6-fps-evidence-consolidation.md` was added. All database/storage
access this phase was read-only (`SELECT` queries and file reads against
the local development instance) — no row was written, no file was moved,
copied, renamed, or altered.

---

## R5A.6 — Result

**PASS**

## FPS Root-Cause Summary

Every real Vanni Part 2 file tested — across multiple independent
exports/redownloads and an explicit Format→Current→AirDrop attempt —
already contains only ~30fps of genuine temporal data before it ever
reaches AVA. AVA's classifier correctly identifies this content as
`experimental_30_fps_class`, in full agreement with real decoded-timestamp
evidence. AVA's ingestion/storage pipeline was proven, via byte-identical
comparison, not to have altered either file. The reduction from the
phone-reported 119.94/180.16 FPS source assets to ~30fps happens somewhere
before any Mac-accessible copy exists — most concretely, it is present
across every tested Photos/export/AirDrop pathway — but this investigation
does not claim to have identified Apple's exact internal mechanism.

## Is AVA incorrectly classifying the tested Vanni MOVs?

**`NOT DEMONSTRATED`** — every classification checked against real
timestamp evidence for every real file tested is correct relative to that
file's actual content.

## Did AVA destroy high-rate temporal data?

**`NOT SUPPORTED`** — pre-upload local probes and byte-identical
storage-object comparisons both rule this out for every file tested.

## Where is the temporal reduction occurring?

Present by the time any Mac-accessible copy exists; proven absent inside
AVA; strongly (not conclusively) associated with the Photos/export/AirDrop
pathway based on three independent, convergent export attempts.

## Is FPS classifier repair still a launch blocker?

**`NO`** — reclassified as defensive hardening / future regression
coverage, since no real Vanni file demonstrates the static-code concern
producing a wrong result.

## Does FPS explain the Vanni skeleton/contact failure?

**`NO`** — directly refuted by `IMG_4848`'s actual stored pose artifact:
55/163 frames (33.7%) missing pose, including a 44-frame (~717ms)
contiguous gap, on a file with correct FPS classification and verified
genuine 60fps data.

## Can tracking investigation proceed on IMG_4848?

**`YES`** — FPS is proven correct and controlled for on this file, and it
already exhibits the target symptom directly and reproducibly.

## Updated R5A Direction

Option B — stop investing further R5A phases in FPS classifier repair;
move the critical path to athlete tracking/pose-loss investigation.

## Next Official Phase

`R5B.1 — Frame-by-frame athlete tracking and pose-loss forensic audit on IMG_4848 (Vanni 60 FPS control)` — not started.

## Files Added

`docs/r5a6-fps-evidence-consolidation.md`

## Production Files Changed

`NONE`

## Progress

**Current prompt:** `R5A.6`
**Prompt status:** `COMPLETE`
**Completed micro-tasks:** `6 / 197`
**R5 completion:** `3.05%`
