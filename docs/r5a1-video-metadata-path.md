# R5A.1 — Production Upload → Video Metadata Extraction Path (Forensic, Read-Only)

Investigation only. No production behavior was changed. This traces exactly
what AVA currently does — it does not propose or apply a fix.

## 1. Production Upload → Metadata Path

```
UI  src/app/athletes/[id]/VideoUpload.tsx
    — writes `sessions` row (video_path, status), NO fps/duration/width/
      height written here. Client-side preflight
      (src/lib/beta/videoPreflight.ts, via video.onloadedmetadata) reads
      ONLY duration/width/height from the browser's <video> element for a
      pre-upload sanity warning — HTMLVideoElement exposes no frame rate,
      so no FPS value of any kind originates here or reaches the DB from it.
      ↓ (raw file → Supabase Storage `sprint-videos` bucket, `sessions.status = "uploaded"`)

Coach clicks "Analyze" → src/app/sessions/actions.ts (Server Action)
    — creates an `analyses`/queue row. Computes `requestedAnalysisFps` as a
      **non-authoritative placeholder** for cost-estimation only (see
      actions.ts:305-317) — the code's own comment states "the worker's own
      detection at analysis time is authoritative and the completion RPC
      validates against ITS result, not this guess."
      ↓

Worker  scripts/analysis-worker.mjs
    — claims the job, downloads a signed URL, calls
      `backend.estimate({signedUrl}, opts)` where
      `opts.fps = VALIDATED_ANALYSIS_FPS` (= 60, hardcoded, analysis-worker.mjs:61,1035)
      ↓

Backend wrapper  src/lib/biomechanics/mediapipe/MediaPipePoseBackend.ts
    — `MediaPipePoseBackend.estimate()` → `PythonMediaPipePoseService.run()`
      ↓

Spawn wrapper  src/lib/biomechanics/mediapipe/PythonMediaPipePoseService.ts
    — spawns the Python runner as a subprocess, passing `--fps 60` (from
      opts.fps above) among other CLI args.
      ↓

★ PROBE FUNCTION (authoritative) ★
src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py
    `probe_fps_evidence()` (line 126) — runs `ffprobe` directly against the
    downloaded local file.
    `classify_fps()` (line 173) — turns that evidence into a classification
    + analysis FPS.
    main() (lines 2909-2941) — orchestrates the above, opens the file with
    `cv2.VideoCapture` as a secondary/fallback source, and assembles
    `sourceFps`/`fps`/`sourceFpsClassification`/etc.
      ↓ (JSON on stdout: `{"fps":..., "sourceFps":..., "sourceAverageFps":...,
         "sourceFpsClassification":..., "width":..., "height":...,
         "sourceDurationSeconds":..., "sourceCodec":..., "frames":[...]}`)

Backend wrapper  MediaPipePoseBackend.ts (`buildPoseSequence`, line 185)
    — maps the raw Python JSON into `PoseSequence.sourceMetadata`
      (fps/averageFps/nominalFps/realFps/timestampFps/variableFrameRate/
      fpsClassification/frameCount/durationSeconds/codec).
      ↓

Worker  scripts/analysis-worker.mjs (lines 1147-1244)
    — reads `sequence.sourceMetadata`, resolves `sourceClassification`
      (Python's value if present — always is, in the mediapipe path — else
      a JS fallback classifier), then persists via RPC:
      `supabase.rpc("update_session_source_metadata", {p_fps: sequence.sourceMetadata.fps,
       p_fps_classification: sourceClassification, p_fps_metadata: {...},
       p_duration_s, p_width, p_height, p_codec})`
      ↓

DB  supabase/migrations/0069_worker_session_source_metadata_rpc.sql
    `update_session_source_metadata()` (SECURITY DEFINER) writes
    `sessions.fps`, `sessions.fps_classification`, `sessions.fps_metadata`,
    `sessions.duration_s`, `sessions.width`, `sessions.height`,
    `sessions.codec`.
      ↓

UI (display)  src/app/sessions/[id]/page.tsx
    reads `session.fps` / `session.fps_classification` back out of the DB
    row (lines 287, 957, 1305) and passes them to the overlay/summary
    components the coach sees. `src/app/sessions/[id]/timing/page.tsx:65`
    reads the same `session.fps` for zone-timing math.
```

**Authoritative extractor**: `probe_fps_evidence()` +
`classify_fps()` in `mediapipe_pose_runner.py`, invoked once per analysis job
(not at upload time — at *analysis* time, when the worker processes the
queued job). There is no separate "upload-time" probe; the raw upload
(`VideoUpload.tsx`) never inspects the file beyond what the browser's
`<video>` element hands over for free (duration/width/height), and that
browser-side reading is never persisted to `sessions.fps` at all.

## 2. FPS Extraction — exact mechanism, per implementation

### `probe_fps_evidence(video)` — `mediapipe_pose_runner.py:126-170`

- **Role**: gathers every independent FPS signal ffprobe/ffmpeg can produce for one file, without picking a winner.
- **Inputs**: local video file path (already downloaded from the signed URL).
- **Outputs**: `{averageFps, nominalFps, realFps, timestampFps, variableFrameRate, durationSeconds, frameCount}`.
- **FPS sources** (cites exact ffprobe fields):
  - `averageFps` ← `stream.avg_frame_rate` (line 140).
  - `nominalFps` ← `stream.r_frame_rate` (line 141).
  - `realFps` ← `frame_count / duration`, both from the same stream-level `nb_frames`/`duration` fields (lines 143-144) — this is a **container-metadata-derived** rate, not a per-frame decode; it will be wrong under exactly the same conditions `averageFps` can be wrong, since it reuses the same `nb_frames`/`duration` tags.
  - `timestampFps` ← median of inter-frame deltas from `ffprobe -show_entries frame=best_effort_timestamp_time` over the **first 5 seconds only** (`-read_intervals %+5`, line 134) — this is the only signal computed from real decoded per-frame timestamps rather than trusted container metadata.
  - `variableFrameRate` ← true if `averageFps`/`nominalFps` disagree by >1%, or if the sampled real-timestamp deltas vary by >2ms (lines 154-157).
- **Fallback behavior**: any `subprocess`/JSON/parse failure returns an all-null evidence object (lines 167-170) rather than raising — downstream code then falls through to `opencv_fps`.

### `classify_fps(evidence, fallback_fps)` — `mediapipe_pose_runner.py:173-223`

- **Role**: turns the evidence bundle into `(classification, reason, analysisFps)`.
- **Inputs**: the evidence dict above, plus a `fallback_fps` (= `src_fps`, itself `evidence["averageFps"] or opencv_fps`, computed by the caller — see below).
- **Outputs**: a 3-tuple: classification string, a human-readable reason string, and the numeric FPS the ANALYSIS pipeline should run at (30 / 60 / a native exact rate / `None` for unsupported).
- **FPS source used to DECIDE the tier**: `detected = evidence.get("averageFps") or fallback_fps` (line 174) — **`avg_frame_rate` is the primary decision input for every tier check**; `timestampFps` (the only real-decode-based signal) is consulted only in specific secondary branches, described next.
- **Fallback/branch behavior** (in the order the code actually checks them):
  1. `detected > maxSupportedFps` (300.5) → `unsupported_source_fps`.
  2. `detected < minSupportedFps` (23.9) → `unsupported_source_fps`.
  3. `59 ≤ detected ≤ 60.5` → `validated_60_fps_class`, analysisFps=60. **No cross-check against `timestampFps` on this branch** — a raw `avg_frame_rate` reading in this window is trusted outright.
  4. Else, only if branch 3 didn't fire: if `timestampFps` is in [59,61] **and** (`nominalFps` or `realFps`) ≥ 59 → also `validated_60_fps_class` ("timestamp_and_metadata_prove_nominal_60").
  5. `29 ≤ detected ≤ 30.5` → `experimental_30_fps_class`, analysisFps=30. **Same gap — no timestamp cross-check on this first-pass branch.**
  6. Else, timestamp+metadata corroboration variant of the 30-class, same shape as (4).
  7. Otherwise → `native_source_class`: `analysisFps` = `detected`, UNLESS `timestampFps` is sane and disagrees with `detected` by >1%, in which case `analysisFps` is corrected to `timestampFps` instead (lines 218-222) — **this correction exists only in this final fallback branch**, per the inline comment (lines 204-217) documenting a real prior incident (a genuine 240fps HEVC clip whose `avg_frame_rate` read 223.926 while decoded timestamps proved ~239.98).

### `opencv_fps` / `main()` — `mediapipe_pose_runner.py:2909-2941`

- `opencv_fps = cap.get(cv2.CAP_PROP_FPS)` (line 2909) — OpenCV's own container-metadata read (effectively a third redundant reading of nominal rate, independent of ffprobe).
- `src_fps = evidence.get("averageFps") or opencv_fps` (line 2911) — **this is the actual `fallback_fps` fed to `classify_fps`**: `avg_frame_rate` first, OpenCV's reading only if ffprobe's average is absent/zero.
- `fps = tier_analysis_fps` (line 2917) — the analysis-cadence FPS from classification.
- **Persistence-critical detail** (lines 2918-2930, with the code's own comment): for `native_source_class` only, `src_fps` is re-synced to the corrected `fps`. For `validated_60_fps_class` / `experimental_30_fps_class`, `src_fps` is **left as the raw, uncorrected `evidence["averageFps"]`** — and it is this `src_fps` (not `fps`) that becomes `sourceFps` in the JSON output (line 4058) and ultimately `sessions.fps` in the database.

### `classifySourceFpsTier()` / `classifySourceFps()` — `src/lib/video/analysisFps.ts:91-131`

- **Role**: a TypeScript re-implementation of the identical classification rule, sharing the same `fpsPolicy.json` thresholds but as separately-written, separately-maintained code.
- **Inputs**: `{detectedFps, averageFps, nominalFps, realFps, timestampFps, variableFrameRate}`.
- **Outputs**: `{classification, reason, policyVersion, analysisFps}`.
- **FPS source**: `detected = evidence.averageFps ?? evidence.detectedFps` (line 92) — same "trust the average" structure.
- **Fallback behavior**: line-for-line the same tier order and the same gap — the `validated_60_fps_class` check at lines 102-103 and the `experimental_30_fps_class` check at line 114-115 both trust `detected` outright with **no timestamp cross-check on the first branch**, identical to the Python version's structure.
- **Where it's actually invoked**: `scripts/analysis-worker.mjs:1150-1159` — `sequence.sourceMetadata.fpsClassification ?? classifySourceFps({...})`. Because `MediaPipePoseBackend.ts` (`buildPoseSequence`, lines 212-218) always populates `fpsClassification` for every classification value the Python runner currently produces, the `??` right-hand side is a JS logical-OR-style short-circuit that **is not evaluated in the normal mediapipe path** — this function is a dormant fallback, not a live second opinion, under all currently-observed production traffic.

### `normalizeFpsDisplay()` / `classifyFpsBand()` — `src/lib/video/analysisFps.ts:57-64, 165-182`

- **Role**: downstream, **display-only** relabeling (e.g. 59.94→60, 119.88→120) of whatever FPS value it's handed. Explicitly documented in its own comment as never rewriting the stored/timing-authoritative FPS.
- **FPS source**: whatever numeric FPS is passed in (in production, `sequence.sourceMetadata.fps`, i.e. the same `src_fps` from Python) — it does not re-derive anything from the video file itself.
- Relevant because it means a wrong `src_fps` (e.g. a real 120fps clip whose `avg_frame_rate` read ~30) is not just misclassified — it is also **re-labeled for display** consistently with the wrong tier (`normalizeFpsDisplay(30)` → still reads/snaps near 30), so the coach-facing number matches the wrong backend number; there's no independent display-side sanity check that would surface the discrepancy.

### `--fps` CLI argument — `mediapipe_pose_runner.py:2825`

- Declared via `argparse` (`parser.add_argument("--fps", ...)`), and populated by the worker with `opts.fps = VALIDATED_ANALYSIS_FPS` (=60, hardcoded) → passed through `PythonMediaPipePoseService.ts:78` as `--fps 60`.
- **`args.fps` is never referenced anywhere else in the 4088-line script** (confirmed via a full-file search — zero matches). It has no effect on `src_fps`, `fps`, or classification. This is a **dead/no-op argument** in the current codebase — see risk notes.

## 3. Persistence

`sessions.fps` ← `sequence.sourceMetadata.fps` (= Python's `src_fps`, **not** `fps`/`tier_analysis_fps` — these two only coincide for `native_source_class`).
`sessions.fps_classification` ← `sourceClassification` (Python's `sourceFpsClassification`, effectively always).
`sessions.fps_metadata` (jsonb) ← `{averageFps, nominalFps, realFps, timestampFps, variableFrameRate, tierReason, tierPolicyVersion, fpsBand, fpsDisplay, wasResampled}` — the full evidence bundle is retained even though only `fps`/`fps_classification` drive most downstream logic, so the raw disagreement between signals (e.g. `averageFps` vs `timestampFps`) is inspectable per-session after the fact.
`sessions.duration_s`/`width`/`height`/`codec` ← the same Python-probed values, same RPC call.

Write path: `scripts/analysis-worker.mjs:1220` → `supabase.rpc("update_session_source_metadata", ...)` → `supabase/migrations/0069_worker_session_source_metadata_rpc.sql`'s SECURITY DEFINER function → direct `UPDATE public.sessions`.

**Historical persistence-failure note** (not this phase's bug, but directly relevant context found during this trace): migration 0069's own comment states that *before* this migration, `service_role`'s lack of an UPDATE grant on `sessions` meant this entire write **silently failed on every single run** and `sessions.fps` was never actually persisted at all, for any classification tier. That gap is fixed (the RPC exists and its result is checked, `analysis-worker.mjs:1244-1248`), but it establishes that FPS persistence itself is a comparatively young, previously-broken code path — worth keeping in mind if any of the three new Vani recordings were processed by an older worker deployment.

## 4. Competing Implementations

| Implementation | File | Classification |
| --- | --- | --- |
| `probe_fps_evidence()` + `classify_fps()` | `mediapipe_pose_runner.py:126-223` | **ACTIVE_PRODUCTION** — the authoritative extractor, invoked every analysis job. |
| `opencv_fps` (`cv2.CAP_PROP_FPS`) | `mediapipe_pose_runner.py:2909` | **ACTIVE_PRODUCTION** — fallback only, used solely when ffprobe's `avg_frame_rate` is absent/zero. |
| `classifySourceFpsTier()`/`classifySourceFps()` | `src/lib/video/analysisFps.ts:91-131` | **ACTIVE_PRODUCTION but dormant** — wired into `analysis-worker.mjs` as a `??` fallback that is not evaluated under any currently-observed real code path, since Python always supplies `fpsClassification` first. Contains the identical no-timestamp-cross-check structure as the Python version. |
| `normalizeFpsDisplay()`/`classifyFpsBand()` | `src/lib/video/analysisFps.ts:57-64,165-182` | **ACTIVE_PRODUCTION** — downstream display-only relabeling, not an independent FPS source. |
| `--fps` CLI arg / `args.fps` | `mediapipe_pose_runner.py:2825` (declared), `analysis-worker.mjs:1035` + `PythonMediaPipePoseService.ts:78` (populated) | **LIKELY_DEAD** — populated and passed through the full pipeline, but never read inside the Python script. No effect on any persisted or computed FPS value today. |
| Browser `video.onloadedmetadata` | `VideoUpload.tsx:50-56` via `videoPreflight.ts` | **NOT AN FPS SOURCE** — reads only duration/width/height for a pre-upload warning; HTMLVideoElement exposes no frame rate. Confirmed to never write to `sessions.fps`. |
| `session.fps_override` (coach manual entry) | `src/app/sessions/actions.ts:495-568`, `src/lib/video/fps.ts` (`applyFpsOverride`) | **ACTIVE_PRODUCTION, but a deliberate manual correction tool, not an automatic extractor** — a coach-entered value that re-times already-extracted overlay frames client-side; does not itself re-probe the file or rewrite `sessions.fps`. Out of R5A.1's "upload/import extraction" scope but directly relevant to R5A.2. |
| `requestedAnalysisFps` (job-submission placeholder) | `src/app/sessions/actions.ts:305-317` | **NOT AN EXTRACTOR** — explicitly documented in its own code comment as a non-authoritative cost-estimate guess; the worker's own detection is authoritative and the completion RPC validates against that, not this value. |

No genuinely old/legacy/dead FPS *extractor* was found (i.e., no second ffprobe-invoking module, no second Python probe). The duplication that does exist is the **classification logic** (`classify_fps` vs `classifySourceFpsTier`), not the underlying ffprobe call itself — there is exactly one place ffprobe is invoked for this purpose.

## 5. Initial Risk Notes (observations only — not fixed this phase)

1. **The two `validated_60_fps_class`/`experimental_30_fps_class` first-pass checks trust `avg_frame_rate` with zero corroboration**, in both the Python (`mediapipe_pose_runner.py:183`, `192`) and TypeScript (`analysisFps.ts:102`, `114`) implementations. The ONLY corroboration logic that exists (timestamp+metadata agreement, or the native-class timestamp correction) is either a *secondary* branch reached only if the raw average misses the window entirely, or scoped explicitly to the `native_source_class` branch. A container `avg_frame_rate` tag that under-reports a real 120fps clip as ~30, or a real 240fps clip as ~60, would be accepted at face value by the very first check, with the real per-frame timestamp evidence (`timestampFps`) never consulted. This is architecturally the same class of metadata-vs-real-decode discrepancy the code's own inline comment (`mediapipe_pose_runner.py:204-217`) already documents having found and partially fixed — for one real 240fps clip whose `avg_frame_rate` read 223.926 instead of ~239.98 — but that fix's scope was explicitly limited to the `native_source_class` fallback, not these two named-band checks. Given the reported symptom (a real 120fps recording landing at ~30fps, a real 240fps recording landing at ~60fps — both a 4x reduction, and both landing exactly on the two protected/named bands rather than a generic native rate), this is the single most suspicious mechanism found in this trace.
2. **`realFps` (`frame_count / duration`) reuses the same container-level `nb_frames`/`duration` tags `avg_frame_rate` is itself often derived from** (`mediapipe_pose_runner.py:143-144`) — it is offered as if it were independent corroborating evidence in the timestamp+metadata branches, but for a container whose duration/frame-count tags are themselves wrong (e.g. an edited/retimed slow-motion container), `realFps` could agree with a wrong `averageFps` for the same underlying reason, not genuinely corroborate it.
3. **`timestampFps` is sampled from only the first 5 seconds** of the file (`-read_intervals %+5`), so a file with a rate change partway through (or an unusual startup pattern) would not be reflected in that signal.
4. **Duplicated classification logic** (`classify_fps()` in Python vs `classifySourceFpsTier()` in TypeScript) shares the policy JSON but not the code — the two currently agree threshold-for-threshold, but nothing enforces that they stay in sync if one is edited without the other. The TS copy being a dormant fallback lowers real-world risk today but doesn't remove the maintenance hazard.
5. **`args.fps`/`--fps 60` is a no-op** — worth flagging so nobody assumes changing `VALIDATED_ANALYSIS_FPS` or the worker's `opts.fps` would change what the Python runner detects or targets; it currently changes nothing.
6. **`sourceFps` (persisted) and `fps` (analysis cadence) intentionally diverge** for `validated_60_fps_class`/`experimental_30_fps_class` in the correct case (e.g. a genuine 59.94fps clip: `sourceFps≈59.94`, `fps=60`) — but under risk #1, if a genuinely-120fps clip is *misclassified* into `experimental_30_fps_class`, both `sourceFps` and `fps` become ~30, and the distinction that would normally hint at a problem (a real rate far from its assigned analysis rate) disappears, because the "real" rate reported is *also* the wrong ~30 reading, not the true ~120.

## Nominal vs actual timing — what the code currently believes

The code does not have one unified "FPS" concept; it deliberately keeps **three**, and the field names describe intent, not necessarily correctness:

1. **`averageFps`/`nominalFps`/`realFps`** (evidence bundle) — all three are *container/aggregate-metadata* concepts (ffprobe's `avg_frame_rate`, `r_frame_rate`, and a `frame_count/duration` derivation) — none of them is a true decoded-frame measurement.
2. **`timestampFps`** — the only field intended as **decoded/effective FPS**, computed from real per-frame `best_effort_timestamp_time` values, but only sampled over the file's first 5 seconds and only actually *decisive* in specific secondary branches.
3. **`sourceFps`/`sessions.fps`** (persisted) — intended to represent **capture FPS** (the real rate the camera recorded at), but is *computed*, not measured directly — it's `averageFps` (or `opencv_fps`), corrected against `timestampFps` only for the `native_source_class` branch.
4. **`fps`/`analysisFps`** — explicitly a **nominal/target processing rate** (30, 60, or a native exact value) chosen by classification, used to drive pose-extraction cadence — not itself a claim about the camera's real capture rate, though it usually coincides with one.
5. There is no dedicated **playback FPS** concept anywhere in this path — the browser preflight never reads FPS at all, and nothing in the extraction path considers how a video player would report playback rate (which can itself differ from capture rate for slow-motion-encoded footage, e.g. a 240fps capture authored with a 30fps playback container hint — a pattern consistent with, though not confirmed as the cause of, the reported symptom).

## Verification

1. ✅ Path is reachable: traced statically from `VideoUpload.tsx` through `sessions/actions.ts` → `analysis-worker.mjs` → `MediaPipePoseBackend.ts` → `PythonMediaPipePoseService.ts` → `mediapipe_pose_runner.py`, each call site confirmed by exact line citation above (not inferred).
2. ✅ Exact FPS property confirmed: `evidence["averageFps"]` (ffprobe `avg_frame_rate`) is the primary decision input in `classify_fps()`/`classifySourceFpsTier()`, with `opencv_fps` (`CAP_PROP_FPS`) as the only fallback when it's absent.
3. ✅ Destination confirmed: `sessions.fps`/`fps_classification`/`fps_metadata`/`duration_s`/`width`/`height`/`codec`, via `update_session_source_metadata` RPC (migration 0069), read back by `src/app/sessions/[id]/page.tsx` and `.../timing/page.tsx` for display and zone-timing math.
4. ✅ More than one metadata extractor exists for *classification* (Python + TS), though only one for the underlying *ffprobe call* itself; documented and classified above.
5. ✅ No production file was modified this phase — only this investigation document was added. Confirmed via `git status` before and after: zero changes to any file under `src/`, `scripts/`, `supabase/migrations/`.
6. ✅ No runtime/typecheck/lint check was necessary — no executable code was created or changed, only a markdown document.

---

### R5A.1 — Result

**PASS**

### Production FPS source

AVA's authoritative FPS source is `ffprobe`'s `avg_frame_rate` (read by `probe_fps_evidence()` in `mediapipe_pose_runner.py:126-170`), consumed by `classify_fps()` (`mediapipe_pose_runner.py:173-223`) at **analysis time** (not upload time) inside the Python MediaPipe worker subprocess; `cv2.CAP_PROP_FPS` (OpenCV) is used only if `avg_frame_rate` is absent, and real decoded-frame timestamps (`timestampFps`) are consulted only in secondary corroboration branches — never as the first-pass decision for the two named `validated_60`/`experimental_30` bands.

### Production path

`VideoUpload.tsx` (raw upload, no FPS read) → `sessions/actions.ts` (analysis request, non-authoritative FPS guess only) → `analysis-worker.mjs` (claims job, invokes pose backend) → `MediaPipePoseBackend.ts` → `PythonMediaPipePoseService.ts` (spawns subprocess) → `mediapipe_pose_runner.py`'s `probe_fps_evidence()`/`classify_fps()` (authoritative extraction + classification) → JSON stdout → `analysis-worker.mjs` persists via `update_session_source_metadata` RPC → `sessions.fps`/`fps_classification`/`fps_metadata` → read back by `src/app/sessions/[id]/page.tsx` and `.../timing/page.tsx` for display/timing.

### Important findings

- FPS is extracted at **analysis time**, not upload time — there is no separate upload-time probe.
- The `validated_60_fps_class`/`experimental_30_fps_class` classification checks trust raw `avg_frame_rate` with **no cross-check against real decoded-frame timestamps** on their first-pass branch — the exact mechanism that could explain a real 120fps clip landing in the 30-class and a real 240fps clip landing in the 60-class, both a 4x reduction consistent with the reported symptom. This is the single most suspicious finding.
- The code already has a documented precedent for `avg_frame_rate` disagreeing with real timestamps on a real 240fps clip (`mediapipe_pose_runner.py:204-217`), but that correction was scoped only to the `native_source_class` fallback, not the two named bands.
- A duplicate classification implementation exists in TypeScript (`src/lib/video/analysisFps.ts`) with the identical structural gap, but it is a dormant fallback under current production wiring, not a live second opinion.
- `--fps`/`args.fps` is a confirmed dead/no-op argument.
- Persisted `sessions.fps` and the analysis-cadence `fps` intentionally diverge for the named bands in the correct case, but collapse to the same (wrong) value if a clip is misclassified — removing a signal that might otherwise hint at the problem.

### Files added

`docs/r5a1-video-metadata-path.md`

### Production files changed

`NONE`

### Next phase

`R5A.2 — Trace FPS from upload through database and analysis job payload`

Not started, per instruction.

---

**Current prompt:** `R5A.1`
**Prompt status:** `COMPLETE`
**R5 completion:** `~4%` (1 of an estimated ~24 micro-phases in the R5A.1–R5M roadmap named in this prompt; treated as a rough equal-weight placeholder denominator until a fuller R5 roadmap is defined — recalculate as later phases refine the actual phase count.)
