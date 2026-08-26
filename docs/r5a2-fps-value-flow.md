# R5A.2 — Complete FPS Value-Flow Trace

Continuation of [`docs/r5a1-video-metadata-path.md`](r5a1-video-metadata-path.md),
kept immutable. Investigation only — no production behavior changed.

## Summary answer to the core question

AVA currently has **three distinct FPS concepts**, not one:

1. **Evidence values** (`averageFps`/`nominalFps`/`realFps`/`timestampFps`) — raw signals from `probe_fps_evidence()`, none authoritative alone.
2. **`src_fps` / `sourceFps`** — the *persisted/displayed* "source" rate. For `native_source_class` it is corrected against `timestampFps`; for `validated_60_fps_class`/`experimental_30_fps_class` it is the **raw, uncorrected `avg_frame_rate`** (R5A.1's finding). This is what ends up in `sessions.fps` and `analyses.source_fps`.
3. **`fps` / `tier_analysis_fps` / `analysisFps`** — the *analysis-cadence* rate chosen by classification (30, 60, or a corrected native rate). This is what ends up in `analyses.analysis_fps` and is compared for internal self-consistency.

**Correction to a hypothesis formed mid-trace**: per-frame *timestamps* used for all downstream timing math (contacts, velocity, step frequency) are **not** simply `frame_index / fps`. See §11 below — this matters and is more reassuring than it first appeared, with one open caveat flagged for R5A.3.

## R5A.2.1 — Frontend upload value

`src/app/athletes/[id]/VideoUpload.tsx` has access to **only** `duration`/`width`/`height`, read from the browser via `video.onloadedmetadata` (lines 50-56), fed into `preflightVideo()` (`src/lib/beta/videoPreflight.ts`) for a pre-upload warning only. **The frontend does not know true FPS at all** — `HTMLVideoElement` exposes no frame-rate property in any browser. Nothing FPS-shaped is generated or passed into the upload; the `sessions` insert (`VideoUpload.tsx` lines 91-96) writes `video_path`, `original_filename`, `status`, `size_bytes` — no fps field.

## R5A.2.2 — `sessions/actions.ts` FPS guess

- **Function**: the analysis-request Server Action containing the `requestedAnalysisFps` computation (`src/app/sessions/actions.ts:311-317`).
- **Variable**: `requestedAnalysisFps`, type `number` (30, 60, or a rounded native rate, e.g. `Math.round(session.fps * 1000) / 1000`).
- **How obtained**: read from the **previously-stored** `session.fps_classification`/`session.fps` — i.e., a prior analysis run's own result (or nothing, on a session that's never been analyzed).
- **Default/fallback**: `60` when classification is neither `experimental_30_fps_class` nor `native_source_class`/`validated_high_speed_native_class` (covers a never-analyzed session).
- **Can it be 30/60/120/240?**: 30 or 60 exactly (named bands), or any native rate the prior run detected (e.g. 45, 90, 120, 144, 240) if the classification was `native_source_class`.
- **Persisted?**: yes — written to `analyses.analysis_fps` at job creation (`p_analysis_fps` in `replace_working_analysis`, `supabase/migrations/0057_rerun_resets_full_analysis_contract.sql:38,65`) and embedded again inside `analyses.input_snapshot.session.requestedOptions.analysisFps` (`actions.ts:368`).
- **Included in the analysis job?**: yes, as above — but **only as a pre-run placeholder**.
- **Influences worker execution?**: **no**. The worker's `opts.fps` passed to the pose backend is a separate, hardcoded constant (`VALIDATED_ANALYSIS_FPS = 60`, `analysis-worker.mjs:61,1035`), not `requestedAnalysisFps`.
- **Does the Python runner receive it?**: no — Python receives `--fps 60` (the hardcoded constant), never `requestedAnalysisFps`.
- **Overwritten later?**: yes — `complete_analysis_job`/`complete_experimental_analysis_job` overwrite `analyses.analysis_fps` with the REAL post-run value (`v_analysis_fps := (p_provenance->>'analysisFps')::numeric`, `supabase/migrations/0068_general_native_source_fps.sql:40,57`).

**Conclusion**: `requestedAnalysisFps` is **purely informational** (a cost-estimate placeholder, explicitly documented as such in the code's own comment, `actions.ts:305-310`) — it cannot contaminate detection, classification, or analysis cadence. It is fully superseded at job completion.

## R5A.2.3 — Job creation

Exact call: `service.rpc("replace_working_analysis", {...})` (`actions.ts:374-382`).

FPS/timing-relevant fields actually in the payload:

- `p_analysis_fps: requestedAnalysisFps` — the guess above.
- `p_input_snapshot` (jsonb) containing, under `session.requestedOptions`: `analysisFps: requestedAnalysisFps`, `poseEngine: "mediapipe"`, `fpsOverride: session.fps_override` (the coach's manual override value, passed through verbatim, unvalidated at this point beyond its own form schema).
- No separate `sourceFps`/`frameRate`/`duration`/`videoId` fields exist in this payload — `duration` and other video metadata are not part of job creation at all (they're populated later, at analysis-detection time, into `sessions`).
- `measurementModelVersion` does **not** appear anywhere in this payload (confirmed — R4B's default-omission is untouched, consistent with the R5A.2 guardrails).

## R5A.2.4 — Database job representation

Two tables involved:

- **`public.analysis_jobs`** (the actual queue/lease table, `supabase/migrations/0018_production_analysis_jobs.sql:9`) — **carries no FPS column at all**. Its columns are queue/lease mechanics (`status`, `attempt_count`, `claim_token`, `claimed_by`, `lease_expires_at`, `heartbeat_at`, `source_video_path`, etc.). Confirmed by reading its `CREATE TABLE` — no `fps`/`frame_rate` field exists there.
- **`public.analyses`** — carries `analysis_fps numeric` (pre-run guess → post-run real cadence, per §2.2/2.3 above) and `source_fps numeric` (null until completion, then set from `p_source_fps` — see §2.13).

**So: no FPS is persisted in the job/queue record itself.** The only pre-run FPS value lives on `analyses.analysis_fps`, and it is explicitly a non-authoritative placeholder until the worker overwrites it at completion.

## R5A.2.5 — Worker claim

`analysis-worker.mjs` claims a job (fields: `claimed.id`, `claimed.analysis_id`, `claimed.session_id`, `claimed.claim_token`, `claimed.input_snapshot`), then separately fetches the **session row** (line ~900) selecting `fps, duration_s, width, height, codec, calibration_gates` among others — this is the session's *prior* detected metadata (null on first run), used only for an upfront cost/duration sanity check (lines 978-985: `session.duration_s * session.fps > config.maxSourceFrames` — a pre-flight guard using whatever was last detected, not this run's truth).

**Values available to the worker before pose estimation, in precedence order actually used**:
1. `opts.fps = VALIDATED_ANALYSIS_FPS` (60, hardcoded) — the only FPS-shaped value actually sent onward to the pose backend.
2. `session.fps`/`session.duration_s` (prior run's stored values, if any) — used only for the pre-flight size/cost guard, never sent to Python.
3. `claimed.input_snapshot.session.requestedOptions.analysisFps` (the §2.2 guess) — read nowhere in the worker's actual pose-invocation path (confirmed via grep — `requestedOptions.analysisFps`/`analysisFps` from the snapshot is never referenced in `analysis-worker.mjs`).

There is no ambiguity/precedence conflict here because only one value (`VALIDATED_ANALYSIS_FPS`) actually reaches the pose backend as a "requested" FPS; the others are inert at this stage.

## R5A.2.6 — `MediaPipePoseBackend.ts`

- **Input interface**: `VideoRef { signedUrl?, width?, height?, durationS?, fps? }` and `PoseEstimateOptions` (includes `fps`, `travelDirection`, `entryGate`, `maxFrames`, `manualRepairs`, `onProgress`, `timeoutMs`).
- **FPS-related properties**: `opts.fps` is forwarded as-is into `PythonMediaPipePoseService.run(video, opts)` — no transformation, no default substitution at this layer (`estimate()`, line 254-257, is a pure pass-through + `buildPoseSequence()` call on the *result*).
- **On the return side**: `buildPoseSequence()` (lines 185-229) maps Python's raw JSON into `PoseSequence.fps`/`.sourceMetadata.{fps,averageFps,nominalFps,realFps,timestampFps,variableFrameRate,fpsClassification,frameCount,durationSeconds,codec}` — a renaming/reshaping step, not a recomputation. Every value here is copied verbatim from `result.*` (Python's fields), with only key-renaming (`result.sourceFps` → `sourceMetadata.fps`, etc.) and light presence-based branching (the `sourceMetadata` block is only added `if (result.sourceFps != null)`, and `fpsClassification` is only carried through if it's one of five recognized enum strings).
- **Conclusion**: this layer changes *shape*, never *meaning* — it neither generates nor overrides any FPS value.

## R5A.2.7 — `PythonMediaPipePoseService.ts` subprocess invocation

Exact spawn (`spawnRunner`, lines 112-119): `spawn(this.python, args, {stdio:[...]})`, no shell.

Args built (lines 77-93): `[runnerPath, "--input", signedUrl]`, then conditionally: `--fps <opts.fps>`, `--max-frames <n>`, `--travel-direction <dir>`, `--entry-gate-x/-y <coords>`, `--repairs-file <tempfile>` (manual world-lock repairs only — unrelated to FPS).

**No environment variables carry FPS.** **No stdin payload** (input is argv only). **No temporary metadata file** carries FPS — the only temp file used (`repairsFile`) is for manual camera-path repairs, a completely separate concept.

**What value is passed as `--fps`?** `opts.fps`, which — per §2.5 — is always `VALIDATED_ANALYSIS_FPS` (60, hardcoded) in the real production call site (`analysis-worker.mjs:1035`).

**Is there any execution branch where it affects analysis?** Confirmed **no**: `args.fps` (declared via `argparse` at `mediapipe_pose_runner.py:2825`) has zero references anywhere else in the 4088-line file (verified via full-file search). It is parsed and then never read. R5A.1's "dead/no-op argument" finding is fully proven, not just suspected.

## R5A.2.8 — Python input state (before `probe_fps_evidence()`)

At the point `probe_fps_evidence()` is called (`mediapipe_pose_runner.py:2910`), the FPS-related variables that exist are:

- `args.fps` — CLI value (60, always, per above) — **unused**.
- Nothing else — `opencv_fps` and `evidence` are both computed **after**/**alongside** this call (lines 2909-2910), not before it. `probe_fps_evidence()` itself takes only the video path.

## R5A.2.9 — `probe_fps_evidence()` output shape

`{averageFps, nominalFps, realFps, timestampFps, variableFrameRate, durationSeconds, frameCount}` (`mediapipe_pose_runner.py:158-166`):

| Field | Source | Meaning | Units | Fallback | Raw or calculated |
| --- | --- | --- | --- | --- | --- |
| `averageFps` | `ffprobe stream.avg_frame_rate` | container's average-rate metadata tag | fps | `None` on parse failure | raw (container tag, `ratio()`-parsed) |
| `nominalFps` | `ffprobe stream.r_frame_rate` | container's nominal/base-rate metadata tag | fps | `None` | raw (container tag) |
| `realFps` | `frame_count / duration`, both from `stream.nb_frames`/`stream.duration` | a container-metadata-derived rate — **not** an independent decode measurement (reuses the same tags `averageFps` can be wrong from) | fps | `None` if either missing | calculated, but from the same container metadata |
| `timestampFps` | median of inter-frame deltas from `ffprobe -show_entries frame=best_effort_timestamp_time`, **first 5 seconds only** | the only field derived from real decoded per-frame timestamps | fps | `None` if <2 usable samples | calculated from real decode evidence |
| `variableFrameRate` | `average` vs `nominal` disagreement >1%, or sampled deltas varying >2ms | VFR flag | bool | `False` | calculated |
| `durationSeconds`/`frameCount` | `ffprobe stream.duration`/`stream.nb_frames` | container-declared duration/count | s / count | `None`/`None` | raw container tags |

`cv2.CAP_PROP_FPS` (→ `opencv_fps`, `mediapipe_pose_runner.py:2909`) is a **separate**, independent read of the container's nominal rate via OpenCV's own demuxer, consulted only as `src_fps`'s fallback when `evidence["averageFps"]` is falsy.

**Playback rate**: no field in this pipeline represents "playback rate" as distinct from capture rate — none of `averageFps`/`nominalFps`/`realFps`/`opencv_fps` is guaranteed to be a *capture* rate rather than a container's *presentation* rate; the code does not distinguish these two concepts anywhere in this function.

## R5A.2.10 — `classify_fps()` branches

Inputs: `evidence` (§2.9 shape), `fallback_fps` (bound to `src_fps = evidence["averageFps"] or opencv_fps` at the call site). Output: `(classification, reason, analysisFps)`.

| # | Condition | Evidence used | Returned FPS | Classification | Reason string | Timestamps participate? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `detected > 300.5` | `detected` only | `None` | `unsupported_source_fps` | `source_above_maximum_supported_rate` | no |
| 2 | `detected < 23.9` | `detected` only | `None` | `unsupported_source_fps` | `source_below_minimum_supported_rate` | no |
| 3 | `59 ≤ detected ≤ 60.5` | `detected` only | `60` | `validated_60_fps_class` | `average_rate_in_validated_60_range` | **no** |
| 4 | (else) `timestampFps∈[59,61]` AND (`nominalFps` or `realFps`) `≥59` | `timestampFps` + `nominalFps`/`realFps` | `60` | `validated_60_fps_class` | `timestamp_and_metadata_prove_nominal_60` | yes |
| 5 | `29 ≤ detected ≤ 30.5` | `detected` only | `30` | `experimental_30_fps_class` | `average_rate_in_experimental_30_range` | **no** |
| 6 | (else) `timestampFps∈[29,31]` AND (`nominalFps` or `realFps`) `∈[29,30.5]` | `timestampFps` + `nominalFps`/`realFps` | `30` | `experimental_30_fps_class` | `timestamp_and_metadata_prove_experimental_30` | yes |
| 7 | otherwise (24-29, 30.5-59, 60.5-300) | `detected`, corrected to `timestampFps` if sane and >1% different | `round(native_detected, 3)` | `native_source_class` | `native_source_rate` | yes (correction only) |

**At exactly 120 or 240**: neither falls in any named window (3/5) directly — a *correctly*-read `detected≈120` or `≈240` lands cleanly in branch 7 (`native_source_class`), keeping its own exact rate. The failure mode under investigation requires `detected` (i.e. `avg_frame_rate`) to have **already misread** as ~30 or ~60 before `classify_fps` ever runs — at that point branches 3/5 accept it immediately with zero corroboration, exactly as documented in R5A.1.

## R5A.2.11 — What controls analysis cadence, and per-frame timestamps

Two related but distinct things:

**A. `fps` (`tier_analysis_fps`)** — the classification's returned rate (30/60/native). This is compared for **internal self-consistency** only: `analysis-worker.mjs`'s `buildResultFoundation()` computes an `expectedFps` from the classification and asserts `sequence.fps === expectedFps` (or within 0.01 for native), throwing if they disagree (lines 570-578). A wrong-but-self-consistent classification (e.g. a real 120fps clip landing at `fps=30, classification=experimental_30_fps_class`) **passes this check** — it's internally consistent, just wrong.

**B. Per-frame `timestampMs`** (`mediapipe_pose_runner.py:3580-3657`) — this is what actually drives every downstream timing computation (contacts, step frequency, velocity all consume each frame's own `time`, per the established `measurements.ts` architecture from R1-R4). The exact logic:

```python
source_timestamp_ms = monotonic_media_timestamp(cap.get(cv2.CAP_PROP_POS_MSEC), source_index, src_fps, previous_analysis_timestamp_ms)
analysis_timestamp_ms = (
    source_timestamp_ms if fps_classification in NATIVE_RATE_FPS_CLASSES
    else (analysis_index / fps) * 1000.0
)
```

`NATIVE_RATE_FPS_CLASSES = ("validated_60_fps_class", "experimental_30_fps_class", "native_source_class", "validated_high_speed_native_class")` (line 40-45) — **every classification current detection code can produce** is in this tuple. The `else` branch (`analysis_index/fps*1000`, a purely synthetic, classification-rate-based timestamp) is therefore **dead for all current classifications** — it would only fire for `high_speed_source_normalized_to_60`, which the codebase's own comments confirm is no longer produced.

**This means**: for every currently-reachable classification, each frame's real timestamp is `source_timestamp_ms` = `monotonic_media_timestamp(cap.get(CAP_PROP_POS_MSEC), source_index, src_fps, prev)` — which **prefers the real, container-decoded per-frame presentation timestamp** (`cv2.CAP_PROP_POS_MSEC`, when positive) over any nominal/index-based calculation. The nominal `frame_index/src_fps*1000` is used only as a **monotonic-safety fallback** when the real timestamp is absent or would go backward/repeat.

**Direct consumers of `frame.time`/`timestampMs`** (established across R1-R4 of this project and reconfirmed unchanged here): contact timing, step frequency, Average/Peak Velocity, zone entry/exit/zone time, temporal smoothing/interpolation windows in the athlete tracker and pose-recovery logic — all of `measurements.ts`'s timing math consumes each frame's own persisted `time`/`timestampMs` directly, never `fps`/`analysisFps` as a recomputation denominator (this pre-dates R5 and was independently reconfirmed multiple times in R1B/R4A/R4B).

**Practical implication, precisely stated**: a misclassification corrupts the **displayed/persisted FPS label and the `analyses.analysis_fps`/`source_fps` values**, and can **reroute the job into a different processing profile** (see Dangerous Coupling below) — but it does **not automatically mean every frame's timestamp is wrong by the misclassification ratio**, because timestamps come from `cv2.CAP_PROP_POS_MSEC` (real container PTS), not from `fps`. **Open caveat, not resolved by static code reading alone**: whether `cv2.CAP_PROP_POS_MSEC` itself reports genuinely-real per-frame times for the *specific* affected Vani 120/240 files — some slow-motion video containers (common on phone-recorded high-speed footage) use edit lists/timecode retiming where the container's own presentation timestamps are stretched independent of true capture spacing, which would make even this "real" timestamp source misleading. This cannot be confirmed from source code alone and requires inspecting the actual affected files — **exactly R5A.3's stated scope**.

## R5A.2.12 — Python result JSON (stdout)

Full FPS/timing-relevant top-level keys (`mediapipe_pose_runner.py:4058-4074`): `fps` (analysis cadence), `sourceFps` (`src_fps`), `sourceAverageFps`, `sourceNominalFps`, `sourceRealFps`, `sourceTimestampFps`, `sourceVariableFrameRate`, `sourceFpsClassification`, `sourceFpsTierReason`, `sourceFpsTierPolicyVersion`, `sourceFrameCount`, `sourceDurationSeconds`, `sourceCodec`, plus per-frame `sourceTimestampMs`/`timestampMs` inside `frames[]`.

Separate values exist for: classified FPS (`sourceFpsClassification`), analysis FPS (`fps`), source FPS (`sourceFps`), timestamp FPS (`sourceTimestampFps`), and the *reason* for the classification (`sourceFpsTierReason`) — but **no numeric confidence score** for the classification itself (the "reason" string is the only provenance of *why*, not a quantified confidence).

## R5A.2.13 — Worker result interpretation

`analysis-worker.mjs` (lines 1147-1244):

- `sessions.fps` ← `sequence.sourceMetadata.fps` (= Python's `sourceFps` = `src_fps`).
- `sessions.fps_classification` ← `sourceClassification` = `sequence.sourceMetadata.fpsClassification` (Python's value; JS `classifySourceFps()` fallback only if absent — never observed in the mediapipe path per R5A.1).
- `sessions.fps_metadata` ← `{averageFps, nominalFps, realFps, timestampFps, variableFrameRate, tierReason, tierPolicyVersion, fpsBand, fpsDisplay, wasResampled}`.
- **No older value is overwritten mid-flight** within this single write — this RPC unconditionally sets all seven columns every completed run (rerun included).
- **Worker-local vs persisted**: identical — the worker never holds a "worker-local" FPS distinct from what it persists; `sequence.sourceMetadata.fps` is used directly as `p_fps`.

Separately, at job completion (`analysis-worker.mjs:1515-1531`), `complete_analysis_job`/`complete_experimental_analysis_job` writes **`analyses.analysis_fps`** ← `(p_provenance->>'analysisFps')::numeric` = `sequence.fps` (tier_analysis_fps, the REAL post-run cadence, overwriting the §2.2 guess) and **`analyses.source_fps`** ← `p_source_fps` = `foundation.provenance.originalSourceFps` = `sequence.sourceMetadata.fps` — the same value as `sessions.fps`. So `sessions.fps` and `analyses.source_fps` are always identical (same origin, same run); `analyses.analysis_fps` is a distinct concept (cadence, not source rate) that legitimately differs from both for the two named bands.

## R5A.2.14 — Database persistence detail

| Column | Table | DB type | Source value | Update behavior | Overwrite on rerun? | Null behavior |
| --- | --- | --- | --- | --- | --- | --- |
| `fps` | `sessions` | numeric | `sequence.sourceMetadata.fps` | unconditional `UPDATE` via RPC | yes, every completed run | starts null, set once detection succeeds |
| `fps_classification` | `sessions` | text (CHECK-constrained enum) | `sourceClassification` | same RPC | yes | same |
| `fps_metadata` | `sessions` | jsonb | evidence bundle | same RPC | yes | same |
| `duration_s`/`width`/`height`/`codec` | `sessions` | numeric/int/int/text | Python-probed | same RPC | yes | same |
| `analysis_fps` | `analyses` | numeric | pre-run guess → post-run `sequence.fps` | set at job creation, **overwritten** at completion | yes (both at creation and completion) | reset to `null`-equivalent guess on rerun via `replace_working_analysis`, not literally null (always has a guess) |
| `source_fps` | `analyses` | numeric | `sequence.sourceMetadata.fps` | explicitly reset to `null` on rerun (`replace_working_analysis`, line 70), then set at completion | yes | **null** between rerun-queued and completion — a real, observable "unknown" state mid-run |

**Rerunning analysis can and does change previously persisted FPS metadata** — every column above is unconditionally rewritten on each completed run; there is no versioning/history retained for `sessions.fps`/`fps_classification` across reruns (only the point-in-time value survives).

## R5A.2.15 — Reload / frontend display

- `src/app/sessions/[id]/page.tsx:287`: `const detectedFps = session.fps ?? overlayMeta?.fps ?? null` — **`session.fps` is the DB column** documented above; `overlayMeta?.fps` (from the pose artifact) is a same-value fallback, not an independent source.
- `page.tsx:957`: `verifiedSourceFps={session.fps ?? null}` — same DB column, passed to a display component.
- `page.tsx:1305`: `sourceFpsClassification={session.fps_classification}` — same DB column.
- `src/app/sessions/[id]/timing/page.tsx:65`: `const sourceFps = session.fps ?? overlay.meta?.fps ?? 60` — same DB column drives the **zone-timing math shown on that page**, not just a label.

**Answer to the stated distinction**: today, "wrong analysis FPS" and "wrong displayed FPS" are **the same root value** for the failure mode under investigation — `session.fps` (displayed) and `analyses.source_fps` (persisted alongside it) both trace to the identical `sequence.sourceMetadata.fps`, and the *analysis-cadence* `fps`/`analysisFps` used for the internal self-consistency check is *also* derived from the same wrong classification (since a misclassification is self-consistent by construction — see §2.10/2.11). They are not two independently-wrong values; they are one wrong classification propagating identically into every column that reads from it. The one place a genuine *timing* value stays independently correct (or at least independently *sourced*) is the per-frame `timestampMs` (§2.11's real-PTS preference) — which is why this investigation treats "displayed/persisted FPS is wrong" and "actual frame timing is wrong" as separate, not-yet-jointly-confirmed claims.

## R5A.2.16 — Downstream consumers of `sessions.fps` (repository-wide)

| Site | Classification |
| --- | --- |
| `src/app/sessions/[id]/page.tsx:287,957,1305` | **Display** — labels shown to the coach. |
| `src/app/sessions/[id]/timing/page.tsx:65` | **Time conversion** — `sourceFps` feeds zone-timing calculations directly on that page. |
| `scripts/analysis-worker.mjs:983-985` (pre-flight `session.duration_s * session.fps > maxSourceFrames`) | **Validation** — a cost/size guard using the *prior* run's value, not this run's truth. |
| `src/app/sessions/actions.ts:311-317` (`requestedAnalysisFps`) | **Legacy-but-inert placeholder** — reads `session.fps`/`fps_classification` to *guess* at job creation, but per §2.2 this guess never reaches the worker's actual pose invocation. Reachable, intended, but scoped to cost-estimation only. |
| `src/lib/video/fps.ts`/`analysisFps.ts` (`classifySourceFpsTier`, `normalizeFpsDisplay`, `classifyFpsBand`) | **Display / dormant-fallback classification** — see R5A.1; not a live decision path under current wiring. |
| `analysis-worker.mjs:1177-1184` (`accelerationEligible`) | **Eligibility** — gates whether an `analysis_type: "acceleration"` job is allowed to complete, based on `sequence.sourceMetadata.fps >= MINIMUM_60_FPS_CLASS`. |
| `analysis-worker.mjs:563-570` (`buildResultFoundation`, `experimental`/`isNativeSource`/`expectedFps`) | **Eligibility + routing** — determines whether the job completes via the normal validated-60 path or the experimental-30 path (`complete_experimental_analysis_job`), and which `expectedFps` self-consistency check applies. This is the "dangerous coupling" — see below. |

No genuinely dead consumer of `sessions.fps` was found in this pass; every site reachable is either display, a validation guard, an inert legacy placeholder, or a real eligibility/routing gate.

## Required dual-value analysis

**Source/display FPS** (`src_fps` → `sourceMetadata.fps` → `sessions.fps` / `analyses.source_fps`) and **Analysis-cadence FPS** (`fps`/`tier_analysis_fps` → `sequence.fps` → `analyses.analysis_fps`) are **separate variables from the moment `classify_fps()` returns** (`mediapipe_pose_runner.py:2914-2917`, two separate assignments: `fps = tier_analysis_fps`, `src_fps` left alone or re-synced).

- **Where they separate**: immediately after `classify_fps()` returns, for `validated_60_fps_class`/`experimental_30_fps_class` — `fps` becomes the fixed 60/30, `src_fps` stays at the raw `evidence["averageFps"]` (e.g. a genuine 59.94fps clip: `fps=60`, `src_fps≈59.94`).
- **When they become identical**: for `native_source_class`, by explicit design (`mediapipe_pose_runner.py:2929-2930`, `src_fps = fps`) — the code's own comment states this re-sync exists specifically so the artifact "never again reports two different fps values for the same native-rate analysis."
- **Is either timestamp-derived?**: `fps` (analysis cadence) is **never** timestamp-derived directly — it's a classification-band constant (30/60) or, only in the native branch, `timestampFps` may correct it. `src_fps` is timestamp-corrected **only** in the native branch; for the two named bands it is **not** timestamp-derived at all — it is the raw `avg_frame_rate`.
- **Under the failure mode being investigated**: a misclassification makes `fps` and `src_fps` **collapse to the same wrong value** for the named bands (both ≈30 or both ≈60) — the divergence that would normally exist between a precise real rate (`src_fps`) and its rounded analysis-band target (`fps`) disappears, removing a signal (a large `fps` vs `src_fps` gap) that might otherwise have hinted something was off.

## 120 FPS thought trace (ffprobe avg_frame_rate ≈ 30, decoded timestamps ≈ 120)

1. `probe_fps_evidence()` returns `averageFps≈30`, `timestampFps≈120` (real decode evidence, correctly measuring the true rate).
2. `src_fps = evidence["averageFps"] or opencv_fps` → **≈30** (averageFps is truthy, so `opencv_fps` is never consulted, regardless of what it would have shown).
3. `classify_fps(evidence, 30)`: `detected = evidence["averageFps"] or fallback_fps` → **≈30**. Branch 3 (`59≤detected≤60.5`) fails. Branch 4 fails (detected not in 59-61 window to even reach it — branches are `if/elif` in effect, and 3 doesn't match so falls through). **Branch 5 (`29≤detected≤30.5`) matches immediately** → returns `("experimental_30_fps_class", "average_rate_in_experimental_30_range", 30)`. **`timestampFps≈120` is never consulted** — branch 5 is a first-pass, no-corroboration match exactly like branch 3.
4. `fps = 30`. `src_fps` stays `≈30` (not native class, no re-sync).
5. Per-frame timestamps: `experimental_30_fps_class` is in `NATIVE_RATE_FPS_CLASSES`, so `analysis_timestamp_ms = source_timestamp_ms = monotonic_media_timestamp(cap.get(CAP_PROP_POS_MSEC), ...)` — **real container PTS is still used** (not `frame_index/30`), so individual frame timestamps are not automatically wrong by this step alone (see the open caveat in §2.11 about whether that container PTS itself is reliable for this specific file type).
6. `buildResultFoundation()`: `experimental = true`, `expectedFps = 30`, `fpsMatches = (sequence.fps===30) = true` → **passes**, no error thrown.
7. `accelerationEligible` check: if `session.analysis_type === "acceleration"`, this **fails** (`sourceClassification === "experimental_30_fps_class"` is explicitly excluded from eligibility) — a real 120fps acceleration clip would be **rejected outright** with "Acceleration analysis requires 60 fps or higher source video (this clip was classified 'experimental_30_fps_class', ~30 fps)." For a `fly` analysis, it instead **completes successfully** but routed through `complete_experimental_analysis_job`, the lower-trust experimental-30 profile (`ava-events-30-experimental-v1` etc.), not the normal validated path.
8. Persisted: `sessions.fps≈30`, `fps_classification="experimental_30_fps_class"`, `analyses.analysis_fps=30`, `analyses.source_fps≈30`. Displayed to the coach as "~30 fps."

## 240 FPS thought trace (ffprobe avg_frame_rate ≈ 60, decoded timestamps ≈ 240)

1. `probe_fps_evidence()` returns `averageFps≈60`, `timestampFps≈240`.
2. `src_fps = evidence["averageFps"] or opencv_fps` → **≈60**.
3. `classify_fps(evidence, 60)`: `detected≈60`. **Branch 3 (`59≤detected≤60.5`) matches immediately** → `("validated_60_fps_class", "average_rate_in_validated_60_range", 60)`. `timestampFps≈240` is never consulted (branch 3 is the same kind of first-pass, no-corroboration match as branch 5 above).
4. `fps = 60`. `src_fps` stays `≈60`.
5. Per-frame timestamps: `validated_60_fps_class` is also in `NATIVE_RATE_FPS_CLASSES` → real container PTS is used, same caveat as above.
6. `buildResultFoundation()`: `experimental = false`, `isNativeSource = false`, `expectedFps = VALIDATED_ANALYSIS_FPS = 60`, `fpsMatches = true` → **passes silently**.
7. `accelerationEligible`: **passes** (`sequence.sourceMetadata.fps (≈60) >= MINIMUM_60_FPS_CLASS (59)`) — a misclassified 240fps clip sails through acceleration eligibility exactly like a genuine 60fps clip; there is **no safety net anywhere in this path** that would catch this case, unlike the 120→30 case where acceleration eligibility at least incidentally rejects it.
8. Persisted: `sessions.fps≈60`, `fps_classification="validated_60_fps_class"`, `analyses.analysis_fps=60`, `analyses.source_fps≈60`. Displayed to the coach as "~60 fps" — indistinguishable, in every persisted column, from a genuine 60fps recording.

## Historical context found during this trace

`supabase/migrations/0068_general_native_source_fps.sql`'s own header comment states: *"0067 fixed the headline bug (120/240 FPS forced onto a 60 FPS identity)..."* — i.e., **a materially similar symptom was previously identified and a fix was shipped** (the `validated_high_speed_native_class`/`native_source_class` tiers). That fix addressed cases where a correctly-read high `detected` value was being force-capped into the 60 identity; it did **not** address the mechanism found in this trace, where an *incorrectly-read* `detected` value (a wrong `avg_frame_rate` reading, not a rate-capping decision) lands the classification in the 30/60 bands in the first place. These are different mechanisms with a similar-sounding symptom — worth being precise about in any future fix scoping.

## Required value-flow table

| Stage | File/function | Variable/field | Example conceptual value | Meaning | Authoritative? | Next consumer |
| --- | --- | --- | --- | --- | --- | --- |
| upload | `VideoUpload.tsx` | *(none — no FPS field exists)* | — | — | n/a | — |
| action (guess) | `actions.ts` `requestedAnalysisFps` | `requestedAnalysisFps` | `60` (default) | pre-run cost-estimate placeholder | **No** | `analyses.analysis_fps` (initial), `input_snapshot` |
| job | `replace_working_analysis` RPC | `analyses.analysis_fps` (initial) | `60` | same guess, persisted | **No** | overwritten at completion |
| worker (requested) | `analysis-worker.mjs:1035` | `opts.fps` | `60` (hardcoded `VALIDATED_ANALYSIS_FPS`) | requested analysis rate sent to Python | Requested, not detected | `PythonMediaPipePoseService` |
| TS pose service | `PythonMediaPipePoseService.ts:78` | `--fps` CLI arg | `"60"` | passed through, **never read by Python** | **No — dead argument** | (nothing — no-op) |
| Python CLI parse | `mediapipe_pose_runner.py:2825` | `args.fps` | `60` | parsed, unused | **No — dead** | (nothing) |
| ffprobe | `probe_fps_evidence()` | `evidence["averageFps"]` | e.g. `~30` for a real-120 clip | `avg_frame_rate` container tag | Primary classification input | `classify_fps()` |
| ffprobe | `probe_fps_evidence()` | `evidence["timestampFps"]` | e.g. `~120` for a real-120 clip | real decoded inter-frame rate (first 5s) | Only in secondary branches | `classify_fps()` (conditionally) |
| opencv | `mediapipe_pose_runner.py:2909` | `opencv_fps` | e.g. `~30` | container nominal rate via OpenCV | Fallback only | `src_fps` |
| pre-classification | `mediapipe_pose_runner.py:2911` | `src_fps` | `~30` | `averageFps or opencv_fps` | **Becomes the persisted "source" value** | `classify_fps()`, JSON output |
| classification | `classify_fps()` | `(fps_classification, fps_tier_reason, tier_analysis_fps)` | `("experimental_30_fps_class", "average_rate_in_experimental_30_range", 30)` | tier decision | **Authoritative for routing/eligibility** | `fps`, completion checks |
| analysis cadence | `mediapipe_pose_runner.py:2917` | `fps` | `30` | chosen processing-cadence label | Authoritative for self-consistency check only | JSON `"fps"`, `analyses.analysis_fps` |
| per-frame timing | `mediapipe_pose_runner.py:3580-3586` | `analysis_timestamp_ms` | real PTS in ms | actual frame time used by every downstream metric | **Authoritative for all timing math** | `measurements.ts` (out of R5 scope) |
| JSON result | stdout | `sourceFps`/`fps`/`sourceFpsClassification`/… | as above | full bundle | — | `MediaPipePoseBackend.ts` |
| backend wrapper | `MediaPipePoseBackend.ts:189-226` | `sequence.sourceMetadata.fps`/`.fpsClassification` | copied verbatim | reshape only | same as Python | `analysis-worker.mjs` |
| worker persistence | `analysis-worker.mjs:1220-1243` | RPC params `p_fps`/`p_fps_classification`/`p_fps_metadata` | `30`/`experimental_30_fps_class`/{...} | what gets written | **Authoritative for DB state** | `sessions` row |
| DB | `sessions.fps`/`.fps_classification` | column values | `30`/`"experimental_30_fps_class"` | persisted source metadata | **Authoritative for display + eligibility guards** | `page.tsx`, `timing/page.tsx`, next `actions.ts` guess |
| DB | `analyses.analysis_fps`/`.source_fps` | column values (post-completion) | `30`/`~30` | persisted cadence/source | Authoritative for that analysis row | analysis history/versioning |
| frontend | `page.tsx:287,957,1305` | `detectedFps`/`verifiedSourceFps`/`sourceFpsClassification` | `30`/`30`/`"experimental_30_fps_class"` | what the coach sees | display of `sessions.fps` | coach |
| frontend (timing) | `timing/page.tsx:65` | `sourceFps` | `30` | drives zone-timing math shown on that page | display + calculation input | zone-timing UI |

## Dangerous coupling found

1. **One `fps` value drives both a display label AND a processing-profile routing decision.** `sourceFpsClassification` determines not just what number is shown, but whether the job runs the normal validated pipeline or the `complete_experimental_analysis_job` experimental-30 pipeline (different completion RPC, different `experimentVersion`/`eventDetectionModelVersion`/etc.) — a misclassified 120fps clip is silently downgraded into a materially different, lower-trust analysis identity, not just mislabeled.
2. **`src_fps` (persisted/displayed) and `fps` (analysis-cadence) are designed to diverge usefully, but a misclassification collapses them to the same wrong value** (documented in "Required dual-value analysis" above) — this removes the one internal signal (a large gap between the two) that might otherwise flag a suspicious classification.
3. **The `fpsMatches` self-consistency check in `buildResultFoundation()` cannot catch a misclassification**, because a misclassified result is, by construction, internally self-consistent (branch 3/5 set `fps` to exactly what `expectedFps` will also compute). The check only guards against *inconsistency* between components, not *correctness* of the classification itself.
4. **`accelerationEligible` incidentally catches the 120→30 case but not the 240→60 case** — not because of any deliberate FPS-integrity check, but because 30 < 60's eligibility threshold while 60 ≥ 60's threshold. A real 240fps recording misclassified to ~60 has **zero** safety net anywhere in this trace.
5. **`--fps`/`args.fps` being a confirmed no-op** is not itself dangerous, but its *presence* (looking like a working configuration knob) is a real hazard for anyone reasoning about this system without reading the Python source line-by-line, as this trace did.

## Production Modification Guard

```
$ git status --short -- src scripts supabase
```
returned only the same pre-existing modifications present since before R5A.1/R5A.2 began (none touched by this investigation) — confirmed no new changes to any file under `src/`, `scripts/`, or `supabase/` this phase. Only `docs/r5a2-fps-value-flow.md` was added.

## R5A.2 Acceptance Criteria — checked against the 13 items

1. ✅ Exact value before job creation: `requestedAnalysisFps` (§2.2).
2. ✅ Exact value in the job: `analyses.analysis_fps` (initial guess) + `input_snapshot.session.requestedOptions.analysisFps`; **not** on `analysis_jobs` itself (§2.3-2.4).
3. ✅ Exact value received by the worker: `opts.fps = VALIDATED_ANALYSIS_FPS = 60` (§2.5).
4. ✅ Exact `--fps` argument: `60`, confirmed unread (§2.7).
5. ✅ Exact evidence generated: `averageFps`/`nominalFps`/`realFps`/`timestampFps`/`opencv_fps` (§2.8-2.9).
6. ✅ Exact classification branch: traced precisely for both 120→30 and 240→60 (§ thought traces).
7. ✅ Exact value controlling analysis cadence: `fps`/`tier_analysis_fps` for self-consistency; **`analysis_timestamp_ms` (real PTS-preferring)** for actual downstream timing math — both identified and distinguished (§2.11).
8. ✅ Exact value returned to TypeScript: full JSON key list (§2.12).
9. ✅ Exact value persisted to `sessions.fps`: `sequence.sourceMetadata.fps` (§2.13-2.14).
10. ✅ Exact value displayed: same `sessions.fps` column, three call sites (§2.15).
11. ✅ Every production consumer classified (§2.16).
12. ✅ 120→30 and 240→60 explained from source code, no speculation, with one explicitly-flagged open question (container PTS reliability for the specific affected files) deferred to R5A.3 rather than guessed at.
13. ✅ No production behavior modified — confirmed via git status.

All 13 acceptance criteria are met.

---

### R5A.2 — Result

**PASS**

### FPS value flow

`requestedAnalysisFps` (inert guess) → `analyses.analysis_fps` (job, pre-run) → `opts.fps=60` (hardcoded, sent to Python, but Python never reads `args.fps`) → `evidence.averageFps` (ffprobe `avg_frame_rate`, the REAL decision input) → `src_fps` → `classify_fps()` → `(fps_classification, fps, src_fps unchanged for named bands)` → per-frame `analysis_timestamp_ms` (real container PTS, independent of `fps`) → JSON → `sequence.sourceMetadata.fps` → `sessions.fps`/`analyses.source_fps` (persisted) + `analyses.analysis_fps` (post-run cadence) → `page.tsx`/`timing/page.tsx` (displayed).

### Analysis FPS

Two separate things currently answer "what controls analysis": `fps`/`tier_analysis_fps` (30/60/native) governs only an internal self-consistency check and is stored as `analyses.analysis_fps`; the value that actually governs every downstream timing computation is each frame's own `analysis_timestamp_ms`, which — for every currently-producible classification — prefers the real, container-decoded `cv2.CAP_PROP_POS_MSEC` timestamp over any `fps`-based calculation.

### Persisted/display FPS

`sessions.fps` (and identically, `analyses.source_fps`) = `sequence.sourceMetadata.fps` = `src_fps` = `evidence["averageFps"]` (raw `ffprobe avg_frame_rate`, uncorrected) for both `validated_60_fps_class` and `experimental_30_fps_class`. This is the exact value the coach sees on `page.tsx`/`timing/page.tsx`.

### 120 → 30 path

`ffprobe avg_frame_rate` reads ≈30 for the real-120fps file, so `classify_fps()`'s branch 5 (`29≤detected≤30.5`) matches immediately with zero corroboration against the real `timestampFps≈120` evidence that was already computed but never consulted at that branch. The result is self-consistent (`fps=30` matches `expectedFps=30`) so no internal check catches it; for a `fly` analysis it silently completes via the lower-trust experimental-30 pipeline, and for an `acceleration` analysis it is correctly (if incidentally) rejected by the unrelated 60fps eligibility gate.

### 240 → 60 path

Same mechanism, one band up: `avg_frame_rate` reads ≈60, branch 3 (`59≤detected≤60.5`) matches immediately, `timestampFps≈240` is never consulted. This case is strictly worse than 120→30 because it lands in the *normal, trusted* validated-60 tier — it passes every eligibility gate in the codebase (including acceleration's 60fps threshold) with no safety net, and is indistinguishable in every persisted column from a genuine 60fps recording.

### Dangerous coupling found

- Classification simultaneously drives the displayed FPS label **and** which completion pipeline/analysis identity the job is routed through (validated vs. experimental-30).
- `src_fps` and `fps` are designed to diverge usefully but collapse to the same wrong value under misclassification, erasing a signal that might flag the problem.
- The only internal self-consistency check (`fpsMatches`) cannot detect a misclassification, since a misclassified result is self-consistent by construction.
- Acceleration's 60fps eligibility gate incidentally catches the 120→30 case but provides zero protection for 240→60.

### Files added

`docs/r5a2-fps-value-flow.md`

### Production files changed

`NONE`

### Next phase

`R5A.3 — Inspect Vani 60 FPS Part 2 source metadata`

Not started, per instruction.

---

**Current prompt:** `R5A.2`
**Prompt status:** `COMPLETE`
**Completed micro-tasks:** `2 / 197`
**R5 completion:** `1.02%`
