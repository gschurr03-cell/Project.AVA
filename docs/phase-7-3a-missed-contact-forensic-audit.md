# Phase 7.3A — Missed Foot Contact Forensic Audit

**Status:** CLOSED  
**Date:** 2026-08-07  
**Roadmap:** 29.5% (unchanged; Phase 7.3A is unweighted)

## 1. Executive summary

Four visually clear contacts are missing from the production marker sequence. The first loss is the **TEMPORAL FILTER** for three (75%) and the pre-contact scientific **QUALITY GATE** for one (25%). The dominant failure is therefore not MediaPipe landmark absence, foot fusion, ground modelling, serialization, summary filtering, or visualization. It is the rolling same-side 250 ms candidate filter: nearby maxima can continually advance its reference point, merging a later, visually distinct stance into an earlier candidate which may itself be removed later.

No detector, threshold, pose, localization, timing, metric, or visualization behavior changed. This phase added trace instrumentation and source contact sheets only.

## 2. Scope

This audit followed stored pose evidence through:

`pose artifact → scientific localization gate → ankle/heel/toe fusion → 3-frame image-y smoothing → per-side maxima → same-side temporal filter → cross-foot de-duplication → StepMark → zone/summary consumers → overlay`

The live repository, database identities, database-referenced artifacts, and source pixels were treated as authoritative. Phase 4.2, 5.0A–E, 6.6B, 7.0, and 7.1 conclusions were not reopened. Cadence expectations were used only to flag intervals for inspection, never to adjudicate contact.

## 3. Benchmark identities

These identities were read from the database on 2026-08-07; the exact referenced pose objects were downloaded read-only. The full snapshot is `tmp/phase73a/production-identities.json`.

| Benchmark | Session | Analysis | Source | Artifact FPS | Pose artifact |
|---|---|---|---|---:|---|
| Gav | `e04a7983-7406-4a00-bb89-8ada7b10bf9f` | `3a148f45-02ff-492d-b9f1-790470b83c21` | `FullSizeRender.mov` | 60 | `…/3a148f45-02ff-492d-b9f1-790470b83c21.pose.json` |
| Vanni 240 | `31fe352b-f00f-4a80-b20a-17c2ab08ec5a` | `a7679326-e193-4489-bf50-735fe402ec60` | `IMG_4557 2.mov` | 239.981 | `…/a7679326-e193-4489-bf50-735fe402ec60.pose.json` |
| Vanni 120 | `160a86a2-c0db-4e7d-9fbe-82aedd6d3eff` | `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c` | `IMG_4556 2.mov` | 120.005 | `…/6d9a6aba-d099-4a33-b8ea-2dd4962fe80c.pose.json` |
| Vanni 60 | `3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d` | `8f55936c-cf07-4c20-ba73-b662e8d24325` | `IMG_4555 2.mov` | 60 | `…/8f55936c-cf07-4c20-ba73-b662e8d24325.pose.json` |

There is **no persisted contact artifact**. Live code and artifact contents agree: contact marks are reconstructed from pose frames by `detectStepMarks`. The manifest therefore records `contactArtifact: null` rather than inventing one.

Discrepancy: `validation/stationary-validation-registry.json` contains older `currentProductionOutputs` for several Vanni runs. The accepted Phase 4.2K scientific replays and later reports contain the current canonical values. Separately, the database-referenced Vanni 60 pose object differs from `tmp/phase42k-final-vanni60.pose.json` in box-origin counts. This audit used the database object for the production contact timeline and the canonical Phase 4.2K artifact only for the unchanged scientific replay. These were not silently conflated.

## 4. Current contact timelines

Each entry is `step:foot@timestamp/sourceFrame`. Full evidence, phase timing, landmark contributors, and acceptance reason are in `tmp/phase73a/disputed-contact-manifest.json`.

- **Gav (12):** `1:R@0.1667/10, 2:L@0.3167/19, 3:R@0.5167/31, 4:L@0.7333/44, 5:R@0.9333/56, 6:L@1.1667/70, 7:R@1.3833/83, 8:L@1.5500/93, 9:R@1.7667/106, 10:L@1.9667/118, 11:R@2.1833/131, 12:L@2.3167/139`.
- **Vanni 240 (9):** `1:R@0.0417/10, 2:L@0.4967/119, 3:L@1.1608/278, 4:R@1.3779/330, 5:L@1.5658/375, 6:L@1.9833/475, 7:R@2.2671/543, 8:L@2.4342/583, 9:R@2.6388/632`.
- **Vanni 120 (10):** `1:L@0.2250/27, 2:R@0.4250/51, 3:L@0.6421/77, 4:R@0.8171/98, 5:L@1.0504/126, 6:R@1.2338/148, 7:R@1.6425/197, 8:R@2.0758/249, 9:L@2.3596/283, 10:R@2.5346/304`.
- **Vanni 60 database artifact (10):** see the machine-readable timeline. Its production-object difference from the canonical Phase 4.2K replay artifact is disclosed above.

Every accepted mark survived a per-side local maximum, same-side spacing, and global de-duplication. The overlay consumes these same `StepMark`s; there is no second visualization detector.

## 5. Candidate missing contacts

The deterministic scan found no unusual intervals for Gav or Vanni 60, three for Vanni 240, and two for Vanni 120. Source pixels adjudicated them as:

| Candidate | Interval | Source result | Missing contact |
|---|---|---|---|
| V240 gap 1 | R 0.0417 → L 0.4967 | **NO CONTACT** between the boundary/start contact and next stance | none |
| V240 gap 2 | L 0.4967 → L 1.1608 | **CLEAR CONTACT** | R, frame 200 / 0.8350 s |
| V240 gap 3 | L 1.5658 → L 1.9833 | **CLEAR CONTACT** | R, frame 443 / 1.8496 s |
| V120 gap 1 | R 1.2338 → R 1.6425 | **CLEAR CONTACT** | L, frame 178 / 1.4842 s |
| V120 gap 2 | R 1.6425 → R 2.0758 | **CLEAR CONTACT** | L, frame 227 / 1.8925 s |

No contact was inserted. No visual numbering gap exists independently of these missing `StepMark`s: numbering is assigned only after final de-duplication.

## 6. Source-frame review

Oriented real-source contact sheets are under `tmp/phase73a/contact-sheets/`. Each clear-contact dossier records before-touchdown, touchdown, mid-stance, toe-off, and after-toe-off frames. The athlete and relevant foot remain in frame in all four cases.

The disputed blue-barrel sequence is V240 frame 443. The source frames show the right foot; the barrel does not hide it. The crop contains the athlete, localization is `tracked`, all three foot landmarks survive, and a right-foot local maximum is created. Historical “occlusion” shorthand is therefore disproved for this contact.

## 7. Landmark evidence

At V240/200 the stored raw pose object contains ankle, heel, and toe at visibility 0.9976–0.9985, but the frame is `frozen_suspect` with `independent_disagrees`. Those coordinates do **not** have scientific authority and are correctly stripped before fusion. Source pixels prove a contact; they do not validate the stored crop’s identity.

At V240/443 all three right-foot landmarks survive (visibility 0.9059–0.9759). At V120/178 all three left-foot landmarks survive (0.9516–0.9615). At V120/227 all three survive (0.9496–0.9681). Coordinates, central-difference velocities, box origins, and per-landmark gate results are in the manifest. The detector has no ground-relative candidate model; it uses normalized image-y local maxima, so no “ground model rejection” occurred.

## 8. Pipeline trace

| Missing contact | Pose/raw points | Scientific gate | Fusion | Local maximum | First loss |
|---|---|---|---|---|---|
| V240 R/200 | present, high raw score | withheld: independent localization disagrees | never reached | none on gated series | **QUALITY GATE** |
| V240 R/443 | present | survives | survives | frame 443 | **TEMPORAL FILTER** |
| V120 L/178 | present | survives | survives | frame 178 | **TEMPORAL FILTER** |
| V120 L/227 | present | survives | survives | frame 227 | **TEMPORAL FILTER** |

For V240/443, frame 443 is within 250 ms of right maximum 397; 397 is subsequently discarded by cross-foot de-duplication against left 375. The later true contact is already gone. For V120, maxima 151→163→178→206→227 form a rolling replacement chain because `lastMs` advances on replacement; neither clear stance survives as a per-side mark. Step integrity, zone filtering, summaries, artifact serialization, and visualization never receive these three candidates.

The diagnostic implementation independently mirrors private stages and asserts its final objects byte-for-byte against live `detectStepMarks`. It passed for all four exact database artifacts.

## 9. Root-cause taxonomy

| Category | Count | Share |
|---|---:|---:|
| Evidence exists and a candidate is created, then temporal-filtered | 3 | 75% |
| Source contact exists but scientific localization quality gate withholds pose evidence | 1 | 25% |
| MediaPipe/raw landmark absence | 0 | 0% |
| Foot fusion loss | 0 | 0% |
| Global de-duplication as first loss | 0 | 0% |
| Step-integrity/ground/summary loss | 0 | 0% |
| Artifact or visualization loss | 0 | 0% |

## 10. Dominant failure analysis

The temporal filter dominates at 75%. This is proven across two source videos and three clear contacts, each with three above-threshold foot landmarks and a raw local maximum. It is specifically state interaction between per-side rolling suppression/replacement and later global de-duplication—not the numeric 250 ms threshold considered in isolation. The one quality-gated miss is a different cause; weakening localization evidence rules would violate established safety and is not justified.

## 11. Recommended Phase 7.3B scope

Open exactly one next phase: **Phase 7.3B — same-side temporal-state isolation**. Test a narrowly scoped correction that prevents a rejected/replaced precursor (especially one later eliminated globally) from indefinitely advancing the suppression reference across a visually distinct contact. Require source-labelled fixtures for these three temporal misses, false-positive regression coverage, all four scientific replays, and unchanged localization gates. Do not broaden it into a detector rewrite and do not target the quality-gated V240/200 case.

## 12. Files changed

- Added this report.
- Added `scripts/phase-7-3a-contact-trace.mjs` (diagnostic only).
- Added `scripts/phase-7-3a-contact-sheets.py` (diagnostic only).
- Added `scripts/phase-7-3a-fetch-production-artifacts.mjs` (read-only database/storage snapshot).
- Generated `tmp/phase73a/` identities, exact artifact copies, contact sheets, and disputed-contact manifest.
- Updated only the roadmap’s documentary phase record.

No production source file was changed by Phase 7.3A.

## 13. Tests

- Trace integrity: PASS for all four database artifacts; reconstructed marks byte-identical to production `detectStepMarks`.
- Deterministic disputed-contact manifest: PASS across consecutive reruns; SHA-256 `f90b0995019e40fda23c16958d466a58e043939e391cd140953fe4cbecd5f699`.
- Contact-sheet extraction: PASS; 82 labelled, orientation-correct source frames across five flagged intervals.
- Typecheck: PASS.
- Lint: PASS.
- Production build: PASS.

## 14. Scientific regression

The existing canonical production measurement replay remains byte-identical:

| Benchmark | Combined step frequency |
|---|---:|
| Gav | 4.848484848484849 Hz |
| Vanni 240 | 3.103448275862069 Hz |
| Vanni 120 | 3.6206896551724137 Hz |
| Vanni 60 | 4.385953327434329 Hz |

No calculations or production behavior changed. Phase 6.2 remains IN PROGRESS solely for its browser-playback blocker. Overall weighted roadmap completion remains 29.5%.

## Closure conclusions

1. Phase 7.3A is **CLOSED**.
2. Four visually clear missing contacts were confirmed.
3. Three of the four disappear at the same-side temporal filter.
4. The fourth is correctly withheld by the existing localization quality gate.
5. The localization-gated contact must **not** be recovered by weakening localization eligibility.
6. Barrel/bin occlusion is disproven for the disputed barrel-area contact; the athlete's foot remains visible in the relevant source frames.
7. No disputed contact was lost in visualization, serialization, foot fusion, ground modelling, or summary filtering.
8. The Phase 7.3A trace reproduces production `detectStepMarks` byte-for-byte on all four benchmark artifacts.
9. The deterministic disputed-contact manifest is preserved with SHA-256 `f90b0995019e40fda23c16958d466a58e043939e391cd140953fe4cbecd5f699`.
10. Canonical scientific replay frequencies remain exactly: Gav **4.848484848484849 Hz**, Vanni 240 **3.103448275862069 Hz**, Vanni 120 **3.6206896551724137 Hz**, and Vanni 60 **4.385953327434329 Hz**.
11. Overall weighted roadmap completion remains **29.5%**.
12. No contact algorithm was modified during closeout. Phase 7.3B was not begun.
13. No commit, push, database reset, or database mutation was performed.

## Agent handoff record

- **Prior architecture inherited:** one pose artifact, live scientific localization gate, mean-of-available ankle/heel/toe signal, three-frame smoothing, per-side maxima/spacing, global de-duplication, shared measurement/overlay `StepMark`s.
- **Prior findings independently verified:** no stored contact artifact; no separate visualization detector; independently corroborated frozen frames alone survive the scientific gate; canonical replay values unchanged.
- **Prior findings corrected:** blanket stripping of every `frozen_suspect` frame in older Phase 5 audit scripts is stale; barrel occlusion does not explain V240/443; registry output snapshots and the database V60 object do not fully match later canonical Phase 4.2K artifacts.
- **Code changed by this agent:** diagnostic scripts and documentation only; no production code.
- **Tests added by this agent:** deterministic trace equivalence and deterministic source-sheet extraction.
- **Real runs performed by this agent:** read-only database identity/artifact fetch, all four production contact traces, source-pixel adjudication, four canonical scientific replays, typecheck, lint, and build.
- **Not personally validated:** user screenshot filenames/locations were unavailable and were not used; this audit did not rerun MediaPipe or alter/rebenchmark inference.
