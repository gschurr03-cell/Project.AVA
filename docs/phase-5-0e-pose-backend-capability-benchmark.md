# Phase 5.0E — Pose Backend Capability Benchmark and Lower-Limb Resolution Study

## 1. Executive summary

Phase 5.0E is complete as an unweighted evidence phase. MediaPipe Heavy and the
repository's existing RTMPose-M COCO-WholeBody model were compared on 223
hash-locked crops drawn from all four registered stationary benchmarks. Every
backend received the same source frame, timestamp, orientation, production
`cropRect`, encoded PNG bytes, and decoded pixels. Only model-required resizing
differed.

The result does **not** support replacing MediaPipe or adding RTMPose recovery.
At AVA's unchanged 0.4 landmark-evidence floor, RTMPose produced **zero
contact-ready frames on every benchmark**. Direct source-pixel inspection showed
that many emitted lower-limb chains were clearly wrong (wall, track, or empty
background), not merely low-confidence. RTMPose was deterministic but about
2.5x slower per crop and used more memory. MediaPipe remains production primary.

This does not disprove that some future pose model could outperform MediaPipe.
It disproves the capability of the existing repository RTMPose checkpoint/path
for AVA's current scientifically verified crops.

## 2. Roadmap status

Phase 5.0E has no defined weight. Status/evidence are recorded without adding
credit. Weighted completion remains **29.5%**. Phase 4.2 remains Complete.

## 3. Confirmed prior evidence

Inherited Phase 4.2K and Phase 5.0A–D findings were preserved: localization is
not reopened; no AVA landmark smoothing exists; alternate crops and partial-foot
reconstruction did not materially recover Vanni 240; contact/timing/metric
thresholds remain unchanged.

## 4. Backend inventory

| Field | MediaPipe | RTMPose |
|---|---|---|
| Model | Pose Landmarker Heavy | RTMPose-M, COCO-WholeBody, 256x192 |
| Asset | `pose_landmarker_heavy.task` (29 MB) | `rtmpose-m_simcc...pth` (69 MB) |
| Detector | internal single-pose task | none in identical-crop mode; legacy YOLO11n/ByteTrack separately exists |
| Schema | 33 landmarks; 17 normalized into AVA | 133 WholeBody landmarks; 17 normalized into AVA |
| Ankles/heels/toes | supported | supported (big toe used as AVA toe; small toe retained only in raw native schema in future work) |
| Confidence | visibility/presence | per-keypoint score |
| Tracking | VIDEO-mode internal tracking | per-crop top-down inference; no temporal tracking in fair path |
| Multi-person | configured one pose | accepts one supplied box; model can run multiple boxes |
| CPU | yes | yes |
| Apple GPU | MediaPipe task graph used Metal context + CPU XNNPACK | PyTorch MPS built but unavailable; CPU used |
| License | repository/runtime license unchanged | MMPose Apache-2.0; PyTorch BSD-3-Clause; legacy Ultralytics path AGPL-3.0 |
| Production | authoritative | experimental visual-only |

No ONNX pose asset, YOLO-pose model, or third pose backend exists. `yolo11n.pt`
is a person detector, not a pose model.

Verified asset SHA-256:

- MediaPipe: `64437af838a65d18e5ba7a0d39b465540069bc8aae8308de3e318aad31fcbc7b`
- RTMPose: `3da02694cd6479d3b333ff42ebd0723f96bfa06adac1db1e2e815ed2e9e1b02d`
- YOLO11n: `0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1`

## 5. Dependency validation

Dedicated environment: `.venv-rtmpose-phase50e` (production `.venv` untouched).

| Dependency | Version |
|---|---:|
| Python | 3.9.6 |
| NumPy | 1.26.4 |
| OpenCV | 4.10.0 |
| PyTorch | 2.8.0 |
| MMPose | 1.3.2 |
| MMCV | 2.1.0 |
| MMEngine | 0.10.7 |
| MMDetection | 3.2.0 |
| Ultralytics | 8.4.90 |

All imports passed; `pip check` reported no broken requirements. MPS was built
but unavailable. CPU model loading and inference passed. A real Vanni 240 frame
completed exact-crop inference, normalization, and source-space remapping before
the benchmark began. No model was downloaded or replaced.

## 6. Common evaluation harness and provenance contract

`scripts/phase-5-0e-pose-benchmark.py` freezes crops as lossless PNGs and records:
backend/model version, source video, source frame/timestamp, crop rectangle,
encoded and decoded-pixel SHA-256, raw native landmarks, normalized AVA
landmarks, confidence, processing time, and source-space mapping. Unsupported
landmarks are explicit; none are inferred. A future fusion system must add a
per-landmark contributor field; this phase performs no fusion.

All 223 frame keys, encoded crop hashes, and decoded-pixel hashes matched across
backends exactly.

## 7. Critical-frame dataset

| Benchmark | Frames | Coverage |
|---|---:|---|
| Gav | 24 | clean controls, sprint extension, contacts |
| Vanni 240 | 133 | positive controls, all foot-availability transitions, 430–550, coast/finish/dropout regions |
| Vanni 120 | 31 | normal run, noisy cluster, pre-exit and exit |
| Vanni 60 | 35 | early run, pre-loss, loss transition, late interval |

This is a stratified diagnostic set, intentionally enriched for transitions; its
rates must not be misrepresented as uniform whole-video prevalence estimates.

## 8. Backend results and contact readiness

Counts use the existing 0.4 evidence floor.

| Benchmark | Backend | Frames | Full lower body | Both ankles | Both heels | Both toes | All six contact joints |
|---|---|---:|---:|---:|---:|---:|---:|
| Gav | MediaPipe | 24 | 21 | 21 | 21 | 21 | 21 |
| Gav | RTMPose | 24 | 0 | 0 | 0 | 0 | 0 |
| Vanni 240 | MediaPipe | 133 | 82 | 84 | 87 | 86 | 84 |
| Vanni 240 | RTMPose | 133 | 1 | 1 | 0 | 0 | 0 |
| Vanni 120 | MediaPipe | 31 | 21 | 21 | 21 | 21 | 21 |
| Vanni 120 | RTMPose | 31 | 2 | 3 | 2 | 0 | 0 |
| Vanni 60 | MediaPipe | 35 | 16 | 20 | 20 | 19 | 19 |
| Vanni 60 | RTMPose | 35 | 1 | 2 | 1 | 0 | 0 |

Because RTMPose has zero contact-ready frames, feeding it to the unchanged
contact detector cannot produce a scientifically supported contact candidate
window. No production metric rerun was performed and no threshold was weakened.

## 9. Source-pixel adjudication

The rendered adjudication sheet is `tmp/phase50e/pixel-adjudication-sheet.png`.
MediaPipe was generally `excellent` or `supported` on positive controls. RTMPose
ranged from occasional `marginal`/`supported` frames to frequent
`clearly_wrong` frames. Clear failures include Gav frame 50 and Vanni 240 frames
475/517/543, where lower-limb chains extend far away from visible joints. No
manual ground-truth annotation exists, so numeric pixel error is not claimed.

Vanni 240 answers:

1. Missing feet are visibly inside many verified crops.
2. MediaPipe still drops evidence on part of the transition set.
3. RTMPose emits coordinates but does not recover reliable evidence.
4. Many emitted RTMPose joints are visibly wrong.
5. It recovers zero contact-ready frames and cannot plausibly restore contacts.
6. It costs about 154 ms/crop versus 62 ms/crop for MediaPipe.

## 10. Temporal and anatomical continuity

RTMPose supplied too few above-threshold consecutive foot samples for a useful
continuity series (0 on Gav, 9 on Vanni 240/120, 3 on Vanni 60). MediaPipe
supplied 6/325/24/36 respectively. Vanni 240 anatomical outliers under the
existing broad torso-relative plausibility band: MediaPipe 0/404 segment samples;
RTMPose 71/532. Emitted landmark count was therefore not treated as validity.

No defensible left/right-swap count is claimed without manual per-frame identity
annotation; visually wrong RTMPose frames are classified as such rather than
over-precisely labeled swaps.

## 11. Runtime, memory, determinism, and deployment

| Criterion | MediaPipe | RTMPose |
|---|---:|---:|
| Load time, first run | 0.91 s | 3.84 s |
| Mean inference | 62.2 ms | 153.8 ms |
| Approx. throughput | 16.1 fps | 6.5 fps |
| p95 by benchmark | 81–88 ms | 171–225 ms |
| Peak RSS, bounded 10-crop run | 338 MB | 454 MB |
| Determinism | exact repeat | exact repeat |

At observed mean cost, 60/120/240-frame clips require roughly 3.7/7.5/14.9 s
of MediaPipe inference versus 9.2/18.5/36.9 s for RTMPose, excluding load and
video I/O. CPU utilization was not sampled with a privileged profiler; wall,
user/system behavior and peak RSS were measured. RTMPose adds a large Python/
PyTorch/MMCV deployment surface. The legacy YOLO path also adds AGPL-3.0 risk.

## 12. Decision matrix

| Criterion | MediaPipe | RTMPose identical crop |
|---|---:|---:|
| Full pose availability | superior | poor |
| Ankle/heel/toe availability | superior | poor |
| Temporal continuity | usable | insufficient |
| Left/right stability | visually supported | not demonstrated |
| Pixel alignment | supported/excellent controls | frequent clearly-wrong output |
| Vanni 240 recovery | incomplete but real | zero contact-ready recovery |
| Gav/Vanni 120/Vanni 60 | materially better | regression |
| Runtime/memory | lower | higher |
| Integration | existing production | high complexity |
| Licensing | existing posture | MMPose Apache; legacy YOLO AGPL concern |

**Decision: retain MediaPipe. Do not add RTMPose as primary, recovery, fusion,
or consensus backend.** The evidence supports Outcome B from the schema-limitation
question: RTMPose has nominally compatible foot topology but worse practical
contact readiness. A new model comparison would require a separate approved
dependency/model checkpoint.

## 13. Files changed and database changes

Changed by this phase:

- `scripts/phase-5-0e-fetch-benchmarks.mjs`
- `scripts/phase-5-0e-pose-benchmark.py`
- `scripts/phase-5-0e-pose-benchmark-sanity.py`
- `package.json` (one test command)
- this report
- `docs/stationary-roadmap-progress.md`

Evaluation artifacts are under `tmp/phase50e/`. No database rows, production
pose architecture, contact logic, metric formulas, timing formulas, or model
weights changed.

## 14. Tests and acceptance

`npm run phase-5-0e-pose-benchmark:sanity`: **25/25 passed**, covering identical
crops/frame/timestamps, explicit unsupported joints, no fabricated topology,
source remapping, left/right mapping, anatomical rejection, transition fixtures,
unchanged scientific thresholds/formula isolation, provenance, no implicit model
download, and exact backend determinism.

Also passed: Python compilation, `rtmpose:sanity`, `pose:sanity`,
`contacts:sanity`, `phase-5-0d-multiframe-contact-evidence:sanity` (28/28),
TypeScript typecheck, and lint. `stationary-validation-registry:sanity` passed
every registry/database/storage check and retained its one pre-existing,
deliberately disclosed failure: the original phase weights sum to 105%, not 100%.

All 16 phase acceptance criteria pass for the evidence-supported decision. The
diagnostic contact adapter correctly terminates at zero RTMPose contact-ready
windows; production metric reruns were neither required nor scientifically useful.

## 15. Remaining limitations and Phase 5.0F recommendation

- The evaluation set is stratified, not a uniform prevalence sample.
- No manually annotated joint-coordinate ground truth exists; visual categories,
  not invented pixel-error values, are reported.
- CPU utilization was not profiler-sampled.
- The study evaluates only models already in the repository.

Recommended Phase 5.0F: do **not** implement fusion. First define a manually
annotated, source-pixel lower-limb ground-truth subset and an approval-gated model
candidate specification requiring compatible foot topology, Apple Silicon support,
redistributable licensing, and materially better performance than MediaPipe on the
same frozen crops. Stop before acquiring any new weights.

## 16. Git status and agent provenance

No commit or push. The worktree contained extensive inherited uncommitted work
before this phase. The three Phase 5.0E scripts, this report, the roadmap entry,
the package script, dependency repair, and benchmark runs described above were
performed by Codex; all Phase 4.2/5.0A–D implementation and findings were inherited
and only independently checked where explicitly stated.

## Engineering Conclusion

**Phase 5.0E is CLOSED.** Roadmap completion remains **29.5%**.

1. The existing RTMPose implementation is **not approved for production use**.
2. RTMPose is **not approved** as:
   - the primary pose backend;
   - a secondary recovery backend;
   - a fusion backend; or
   - a consensus backend.
3. This decision is based on scientific evidence gathered under the
   identical-crop evaluation protocol, not on a preference for MediaPipe.
   Both backends received identical source frames, source timestamps,
   orientation, localization, crop rectangles, encoded crop bytes, and decoded
   crop pixels. Under that controlled comparison, the existing RTMPose model
   produced no contact-ready frames and frequently emitted visibly incorrect
   lower-limb geometry.
4. The dominant remaining limitation is **not localization** and is **not
   contact detection**. Phase 4.2 independently closed the localization
   question, and Phases 5.0C–D established that crop recovery and contact logic
   do not explain the residual missing evidence.
5. The dominant remaining limitation is **MediaPipe's lower-limb pose
   availability on small athletes at long distance**.
6. Backend evaluation should be reopened only when a candidate can reasonably
   demonstrate a meaningful improvement in lower-limb landmark recovery while
   preserving or improving all of the following:
   - localization integrity;
   - landmark correctness;
   - temporal stability;
   - runtime;
   - deterministic behavior; and
   - licensing suitability.
7. No backend change, recovery path, or fusion implementation is authorized by
   Phase 5.0E.
