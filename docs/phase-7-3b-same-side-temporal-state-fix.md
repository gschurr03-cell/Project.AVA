# Phase 7.3B — Same-Side Temporal State Isolation

**Status:** CLOSED  
**Date:** 2026-08-07  
**Roadmap:** 29.5% (unchanged; Phase 7.3B is unweighted)

## 1. Executive summary

The three Phase 7.3A temporal-filter misses now recover at their exact adjudicated contact frames: Vanni 240 right/443 and Vanni 120 left/178 and left/227. The localization-withheld Vanni 240 right/200 contact remains rejected. Gav and Vanni 60 contact identities are byte-identical to baseline, and no contact identity changed beyond the three intended recoveries.

The smallest defect was state ownership across two sequential filters. A per-side candidate could own cooldown history, then be removed by cross-foot de-duplication; its rejected successors were never reconsidered. The fix retains the already-generated raw candidates and, only when the final merged sequence contains a same-foot adjacency, resolves one eligible opposite-foot candidate using the existing global spacing guard on both sides. It creates no evidence and changes no threshold.

The prior contradictory requirement has now been formally corrected: unrelated scientific evidence and unrelated metrics remain unchanged, while metrics that directly consume the newly recovered, scientifically valid contacts update through the existing unchanged formulas. All changes are confined to the three intended recoveries.

## 2. Phase 7.3A inherited evidence

Phase 7.3A is CLOSED and remains unchanged. Four source-pixel contacts were clear. V240/200 was correctly withheld by localization eligibility and is not a Phase 7.3B target. V240/443, V120/178, and V120/227 had eligible ankle/heel/toe evidence and local maxima but disappeared in same-side temporal state. The closed deterministic manifest remains byte-identical with SHA-256 `f90b0995019e40fda23c16958d466a58e043939e391cd140953fe4cbecd5f699`.

## 3. State-machine reconstruction

The old code has no named enum, but its state is exactly:

- `UNINITIALIZED`: no accepted candidate on this foot; `lastMs=-Infinity`.
- `OWNED(candidate,lastMs)`: the current per-foot survivor owns cooldown.
- `REPLACED(candidate,lastMs)`: a deeper candidate inside 250 ms replaces the survivor and advances `lastMs`.
- `REJECTED`: an inside-window candidate no deeper than the owner is discarded; state does not change.
- `SIDE_FINAL`: per-foot scan ends; only its survivors remain.
- `GLOBAL_FINAL`: both sides merge; candidates less than 130 ms apart, or same-side candidates less than 250 ms apart, compete by prominence/visibility score.

Old transition diagram:

```text
UNINITIALIZED
  └─ candidate → OWNED(candidate, candidate.time)

OWNED(owner,lastMs)
  ├─ gap >= 250 ms → OWNED(candidate, candidate.time)
  ├─ gap < 250 ms and candidate deeper
  │    → REPLACED(candidate, candidate.time) → OWNED
  └─ gap < 250 ms and not deeper
       → REJECTED → OWNED(owner,lastMs)

SIDE_FINAL(left,right)
  └─ merge/sort → GLOBAL_FINAL
       ├─ gap >= guards → keep both
       └─ gap < guard → keep stronger; loser removed permanently
```

Every timer comes from source time, not frame count. The guards remain `minSameSideSpacingMs=250`, `minStepSpacingMs=130`, visibility `0.4`, smoothing window `3`, and amplitude `0.01`. State resets at the start of each `detectSide` call and never persisted across runs. The defect is not stale cross-run state; it is that global removal happens after the per-side owner has already suppressed successors.

New transition appended after unchanged global de-duplication:

```text
GLOBAL_FINAL
  ├─ adjacent sides differ → unchanged
  └─ adjacent sides match (A ... A)
       ├─ no generated opposite candidate >=130 ms from both A marks
       │    → unchanged
       └─ eligible opposite candidates exist
            → choose the last eligible candidate
            → insert between A marks
            → history for this resolved interval ends
```

“Last eligible” assigns the interval to the candidate immediately preceding the trailing same-foot strike; earlier opposite-side peaks may still be cross-foot echoes of the leading strike. Both existing global spacing guards must hold. A localization-stripped contact produces no candidate and cannot enter this transition.

## 4. Three failure traces

### 4.1 Vanni 240 right frame 443

Complete old per-side transition sequence around the failure:

| Candidate | Time | State before / comparison | Transition | State after |
|---:|---:|---|---|---|
| R330 | 1.377917 | previous right owner is outside 250 ms | accept | owner R330, `lastMs=1377.917` |
| R353 | 1.473750 | gap 95.833 ms; prominence 0.618921 < R330 0.637175 | reject | R330 unchanged |
| R365 | 1.523750 | gap 145.833 ms; 0.626844 < 0.637175 | reject | R330 unchanged |
| R397 | 1.657500 | gap 279.583 ms ≥250 | accept | owner R397, `lastMs=1657.500` |
| R410 | 1.711667 | gap 54.167 ms; 0.636343 < R397 0.637620 | reject | R397 unchanged |
| R418 | 1.745417 | gap 87.917 ms; 0.626471 < 0.637620 | reject | R397 unchanged |
| R423 | 1.766250 | gap 108.750 ms; 0.611343 < 0.637620 | reject | R397 unchanged |
| **R443** | **1.849583** | gap 192.083 ms; 0.632248 < 0.637620 | **reject: same-foot cooldown/minimum spacing** | R397 unchanged |
| R464 | 1.937500 | gap 280.000 ms ≥250 | accept | owner R464 |
| R482 | 2.012500 | gap 75.000 ms; 0.632765 > R464 0.627780 | replace | owner R482, `lastMs=2012.500` |

Global transition: L375 at 1.565833 and R397 at 1.657500 are 91.667 ms apart, so R397 loses global de-duplication. R482 is only 29.167 ms after L475 and also loses. Final state becomes L375→L475, but R397's earlier ownership has already destroyed R443.

New transition: between L375 and L475, eligible generated right candidates satisfying ≥130 ms from both bounds are R410, R418, R423, and R443. R443 is the last eligible candidate and becomes the interval owner. Result: L375→R443→L475.

Cause classification: same-foot cooldown plus incorrect history ownership after duplicate suppression. Not cadence expectation, maximum spacing, foot fusion, or missing opposite-foot evidence.

### 4.2 Vanni 120 left frame 178

| Candidate | Time | State before / comparison | Transition | State after |
|---:|---:|---|---|---|
| L126 | 1.050417 | prior owner outside 250 ms | accept | owner L126 |
| L151 | 1.258750 | gap 208.333 ms; 0.634713 < L126 0.643915 | reject | L126 |
| L153 | 1.275417 | gap 225.000 ms; 0.637657 < 0.643915 | reject | L126 |
| L163 | 1.359167 | gap 308.750 ms ≥250 | accept | owner L163, `lastMs=1359.167` |
| L169 | 1.409167 | gap 50.000 ms; 0.623593 < L163 0.628036 | reject | L163 |
| **L178** | **1.484167** | gap 125.000 ms; 0.647176 > 0.628036 | **replace, but not emit final contact** | owner L178, `lastMs=1484.167` |
| L200 | 1.667500 | gap 183.333 ms; 0.639335 < L178 0.647176 | reject | L178 |
| L206 | 1.717500 | gap 233.333 ms; 0.648058 > 0.647176 | replace | owner L206, `lastMs=1717.500` |

L178 exits because replacement advances history and a later maximum replaces it before per-side finalization. In the merged baseline, R148→R197 is same-foot adjacency. Eligible left candidates ≥130 ms from both bounds are L169 and L178; L178 is last and is restored.

Cause classification: rolling same-foot cooldown, replacement, and history persistence across an opposite-foot interval. Missing-opposite-foot recovery is the correct transition.

### 4.3 Vanni 120 left frame 227

This continues the exact state above; there is no reset between the two failures:

| Candidate | Time | State before / comparison | Transition | State after |
|---:|---:|---|---|---|
| L206 | 1.717500 | inherited replacement owner | owner | `lastMs=1717.500` |
| L212 | 1.767500 | gap 50.000 ms; 0.639528 < L206 0.648058 | reject | L206 |
| L216 | 1.800833 | gap 83.333 ms; 0.638759 < 0.648058 | reject | L206 |
| **L227** | **1.892500** | gap 175.000 ms; 0.653122 > 0.648058 | **replace, but not emit final contact** | owner L227, `lastMs=1892.500` |
| L243/L246 | 2.025833/2.050833 | inside rolling window; weaker | reject | L227 |
| L283 | 2.359583 | cooldown expired | accept | owner L283 |

L227 remains transient and never reaches the merged list. Baseline R197→R249 is same-foot adjacency. L212 is only 125 ms after R197 and is ineligible; L216 and L227 satisfy both global guards. L227 is last and is restored.

Cause classification: same-foot cooldown plus incorrect history persistence; not global de-duplication as first loss, cadence expectation, or ground support modelling.

## 5. Root cause and invariant

The narrow defect is **temporal state ownership finalized too early**. Per-foot cooldown suppression executes before the cross-foot stage establishes whether its owner represents a unique physical contact. When global de-duplication disproves that owner, already-generated successors stay irreversibly suppressed.

The evidence-supported invariant is:

> One physical touchdown may produce at most one accepted contact. A candidate may suppress same-foot successors only while it remains the authoritative representative of that physical touchdown. If cross-foot de-duplication removes that representative and leaves a same-foot adjacency, one already-generated, globally spaced opposite-foot candidate may own the unresolved interval. No candidate may be created from withheld localization evidence.

Alternation is evidence for an unresolved interval, not a rule that fabricates steps: no eligible candidate means no recovery. The V240/200 quality-gated interval therefore remains L119→L278.

## 6. Fix

Only `src/lib/video/steps.ts` production logic changed:

1. `detectSide` now returns its unchanged accepted contacts plus the raw candidates it already generated.
2. Existing per-side filtering and global `suppressDuplicates` remain unchanged.
3. `recoverSuppressedOppositeContacts` examines only same-foot adjacencies after global de-duplication.
4. It requires a real opposite-side candidate strictly between the bounds and at least the existing 130 ms from each.
5. It inserts the last eligible candidate and resolves that interval once.

No visibility/amplitude/spacing threshold, smoothing, foot fusion, localization gate, timing, zone logic, step numbering formula, metric formula, serialization, or rendering code changed.

## 7. Before/after state diagrams

```text
BEFORE
raw maxima → per-side owner/cooldown → global de-dup
                    │                      │
                    └─ suppressed forever  └─ can delete the owner later

AFTER
raw maxima ─┬→ unchanged per-side owner/cooldown → unchanged global de-dup
            │                                      │
            └──────── retained candidates ─────────┘
                                                   ↓
                              same-foot adjacency + eligible real opposite max?
                                     no → unchanged
                                     yes → one interval owner restored
```

## 8. Real benchmark validation

Exact database-artifact contact identities:

| Benchmark | Before | After | Delta |
|---|---:|---:|---|
| Gav | 12 | 12 | none; byte-identical identities |
| Vanni 240 | 9 | 10 | +R443 only |
| Vanni 120 | 10 | 12 | +L178 and +L227 only |
| Vanni 60 | 10 | 10 | none; byte-identical identities |

V240/200 remains absent because its localization-stripped frame produces no eligible candidate. No additional unsupported identity appears. `tmp/phase73b/state-validation.json` records complete before/after identities and has SHA-256 `30ff3f96a850b52c062854d5a7399f09dc1e6369c180fbd2f958116acbf72077`.

## 9. Regression

Canonical measurement replays after the intended contact recovery:

| Benchmark | Valid contacts before→after | Frequency before→after | Result |
|---|---:|---:|---|
| Gav | 9→9 | 4.848484848484849→4.848484848484849 Hz | unchanged |
| Vanni 240 | 7→8 | 3.103448275862069→3.6206896551724137 Hz | intended R443 consequence |
| Vanni 120 | 8→10 | 3.6206896551724137→4.655172413793103 Hz | intended L178/L227 consequence |
| Vanni 60 | 10→10 | 4.385953327434329→4.385953327434329 Hz | unchanged |

Zone times remain 1.92, 2.12, 2.19, and 2.40 seconds respectively. Contact-derived step length, GCT/flight aggregation, and peak velocity can change for V240/V120 because their legitimate input contact sequence changed; no formula changed. Two consecutive replays are deterministic.

Regression results:

- Closed Phase 7.3A baseline trace: PASS; preserved manifest SHA-256 `f90b0995019e40fda23c16958d466a58e043939e391cd140953fe4cbecd5f699`.
- Phase 7.0: 26/26 PASS.
- Phase 7.1: 24/24 PASS.
- Phase 6.6B Part B: 18/18 PASS.
- Existing step detector sanity: 23/23 PASS after repairing its pre-existing JSON-module test-harness option.
- Typecheck: PASS.
- Lint: PASS.
- Production build: PASS.

## 10. Tests

`scripts/phase-7-3b-temporal-state-sanity.mjs`: 11/11 PASS, covering:

1. same-side duplicate rejection;
2. legitimate repeated same-foot sequence after an opposite transition;
3. missing-opposite-foot recovery;
4. cooldown expiry and existing global spacing;
5. interval history reset;
6. unchanged localization rejection;
7. all three disputed recoveries;
8. no duplicate contacts;
9. unchanged Gav;
10. unchanged Vanni 60;
11. no benchmark identity delta outside the intended three.

The test uses the exact database-referenced pose artifacts and applies the live scientific localization gate before `detectStepMarks`.

## 11. Acceptance-Criteria Reconciliation

The previous requirement that Vanni 120 both recover two legitimate in-zone contacts and remain numerically identical was impossible under the unchanged Step Frequency formula. Two additional valid contacts inside the same unchanged measurement zone necessarily change `validContacts` and Step Frequency when the existing formula is applied honestly.

Scientific correctness takes priority over historical numerical equality. The benchmark protects the method and source-specific evidence; it must not freeze an output produced while valid contacts were missing. No recovered contact was hidden, zone membership was not altered, metric and timing formulas were not altered, contact weights were not introduced, and no special-case exclusion was added.

The reconciled acceptance criterion is:

> Unrelated scientific evidence and unrelated metrics must remain unchanged. Metrics that directly depend on newly recovered, scientifically valid contacts are expected to update according to the existing unchanged formulas.

All corrected closure conditions pass:

- R443, L178, and L227 are validly recovered.
- R200 remains localization-rejected.
- No unsupported contact appears and no other contact identity/status changes.
- Metric formulas, timing formulas, and zone logic remain unchanged.
- Gav and Vanni 60 remain unchanged.
- Vanni 240 and Vanni 120 metric changes trace only to the recovered contacts.
- Two replay passes are deterministic and all required regressions pass.

Phase 7.3B is therefore **CLOSED**.

## 12. Remaining limitations

- V240/200 remains intentionally unavailable; only new independent localization evidence could reopen it.
- Recovery requires a generated opposite-foot maximum and cannot help true pose absence.
- Phase 7.3B did not address contact placement outside the four adjudicated regions or redesign contact detection.

## Closure conclusions

1. The same-side temporal defect was premature temporal-state ownership.
2. Exactly Vanni 240 R443 and Vanni 120 L178/L227 were recovered.
3. Vanni 240 R200 remains correctly rejected by localization quality.
4. No unsupported contacts were introduced; no other contact identity or status changed.
5. Gav remains **4.848484848484849 Hz** and Vanni 60 remains **4.385953327434329 Hz**.
6. Vanni 240 updates from **3.103448275862069 Hz** to **3.6206896551724137 Hz**; Vanni 120 updates from **3.6206896551724137 Hz** to **4.655172413793103 Hz**.
7. Those metric changes are legitimate downstream consequences of the recovered contacts under unchanged formulas, timing, and zone logic.
8. The closed Phase 7.3A manifest remains SHA-256 `f90b0995019e40fda23c16958d466a58e043939e391cd140953fe4cbecd5f699`.
9. Phase 7.3B is **CLOSED**. Overall weighted roadmap completion remains **29.5%** because Phase 7.3B is unweighted.
10. No commit, push, database reset, or database mutation was performed.

## Files changed

- `src/lib/video/steps.ts` — localized temporal ownership recovery.
- `scripts/phase-7-3b-temporal-state-sanity.mjs` — deterministic exact-artifact tests.
- `scripts/steps-sanity.mjs` — test-only `resolveJsonModule` repair.
- `scripts/phase-7-3a-contact-trace.mjs` — explicit closed-baseline replay mode preserving the Phase 7.3A manifest.
- `scripts/phase-7-3a-contact-sheets.py` — added the V240 candidate-sequence source sheet used for adjudication.
- `package.json` — Phase 7.3B sanity command.
- This report and the roadmap.

No commit, push, database reset, or database mutation was performed.
