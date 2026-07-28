# Scientific validation readiness audit

Audit date: 2026-07-18. Decision: **NO-GO for athlete-facing scientific claims**.

AVA has substantial unit/fixture testing for FPS classification, sampling, event detection,
calibration, camera motion, panning, pose mapping, metrics, confidence contracts,
recommendations, priorities, reports, projections and Digital Twin consistency. This proves
deterministic software behavior, not analytical validity.

Only one real panning fixture is governed in the repository. It is a true 30 FPS
experimental recording with several people visible, unknown validation consent, and an
incompletely defined 2.77-second reference. It is quarantined from study inclusion. No
locked 60/120/240 FPS reference dataset, force/pressure reference, cross-device block,
dual-review annotations, blinded coach study, athlete comprehension study, prospective
projection outcomes, or confidence-calibration sample exists.

| Output | Current evidence | Scientific status / policy |
| --- | --- | --- |
| FPS classification/60 Hz sampling | Extensive deterministic fixtures | Fixture validated; production policy tested |
| Zone timing | Manual/engineering fixtures and comparison tooling | Partially validated; coach review only |
| Average zone velocity | Derived from timing/calibration | Partially validated; coach review only |
| Step detection/frequency | Synthetic and development fixtures | Fixture validated; warning required |
| Step length | Development diagnostic/tape comparison tooling | Partial; coach review only |
| Contact/flight time | Algorithm fixtures | Unvalidated temporal estimate; experimental |
| Calibration/zone detection | Synthetic fixtures and one panning case | Fixture/manual spot-check only |
| Athlete tracking/dynamic crop/pose | Engineering fixtures | Unvalidated against reference annotations |
| Peak velocity | Definition/reference unresolved | Hidden |
| Kinematic angles | 2D pose estimates | Unvalidated; coach only, non-diagnostic |
| Root Cause/recommendations/priorities/reports | Deterministic safety fixtures | Unvalidated by blinded coaches |
| Projections/PB | Contract and determinism tests | Experimental; race/PB synthesis unsupported |
| Benchmarks | Versioned compatibility foundation | Dataset population review incomplete |

The highest priority is consented locked reference collection using synchronized gates and
dual-review high-speed annotations—not further threshold tuning.

