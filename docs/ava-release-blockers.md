# AVA release blocker registry

Updated: 2026-07-18. Code existence is not validation evidence.

| ID | Severity/category | Owner role | Subsystem | Blocker / impact | Evidence / acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- |
| IOS-001 | Critical/iOS | iOS lead | Toolchain | No full Xcode/device build | Signed Release app builds and device suite passes | Open |
| API-001 | Critical/backend | Backend lead | Mobile API | `/api/mobile/v1` not deployed | Staging auth/upload/status/result integration passes | Open |
| IOS-002 | Critical/infrastructure | Mobile/backend | Upload | Task persistence/resumable API unproven | termination/restart matrix passes | Open |
| IOS-003 | High/iOS | iOS lead | Beta UI | Screens not simulator/device validated | UI/accessibility suite and manual matrix pass | Open |
| TF-001 | Critical/App Store | Release owner | TestFlight | No team/signing/archive/upload | validated internal build installed | Open |
| PRIV-001 | Critical/privacy | Privacy/legal | Athlete data | Privacy/retention/export review incomplete | approved assessment and deletion/export test | Open |
| SAFE-001 | Critical/scientific | Science/legal | Claims | Athlete language not beta-reviewed | snapshot corpus passes clinical-language review | Open |
| OPS-001 | High/infrastructure | Platform | Orchestration | Production concurrency/cutover unproven | rollout gates pass production-like load | Open |
| A11Y-001 | High/iOS | Accessibility QA | Native UI | No VoiceOver/large-type device pass | zero P0/P1 accessibility blockers | Open |
| APP-001 | High/business | Product/legal | Store metadata | Identity, URLs, privacy answers/assets missing | App Store checklist approved | Open |
| TPI-001 | Critical/scientific | Sprint science lead | Training rules | V1 dosage/load rules lack external review | Rule/catalog corpus approved with evidence | Open |
| TPI-002 | Critical/safety | Clinical/coach governance | Restrictions | No real approval/override governance evidence | authority and escalation scenarios approved | Open |
| TPI-003 | Critical/backend | Backend lead | Plan persistence/API | No durable store/audit/approved pointer | scoped integration and transition tests pass | Open |
| TPI-004 | High/validation | Coaching QA | Athlete rollout | Fixture-only; no coach or athlete validation | bounded internal draft study meets gates | Open |
| TPI-005 | Critical/data | Backend lead | Adherence/revisions | No immutable durable event/revision store | idempotency, isolation and recovery integration pass | Open |
# 2026-07-18 Training Program longitudinal blockers

- Append-only athlete/account-isolated event persistence, server sequencing, checkpoints,
  quarantine, retention, and replay authorization are not deployed.
- Mesocycle, progression, competition, fatigue, tolerance, and reentry rules have not been
  reviewed by sprint coaches or validated longitudinally.
- Coach review/approval UI, native offline package signing/revocation, safety notification,
  and device reconciliation are not implemented.
- Longitudinal mode remains disabled; fixture evidence must not be described as athlete
  beta, production readiness, or production proof.
# Prompt 15A closed-beta hard blockers — 2026-07-18

- Provision isolated staging and closed-beta database/storage/secrets/telemetry projects.
- Select and codify web/worker deployment infrastructure; promote immutable artifacts.
- Enforce distributed rate limits, quotas and worker admission/backpressure.
- Complete centralized authorization and staging cross-account/athlete/organization tests.
- Deploy redacted logs, metrics, traces, error reporting, dashboards and actionable alerts.
- Complete deletion worker plus successful database/object restore and rollback rehearsals.
- Produce signed iOS/TestFlight, physical-device, offline safety and account-isolation evidence.
- Obtain professional privacy, consent, retention, training and minors-policy review.
- Assign incident, support, security, science and training-safety responders.
# Prompt 15B scientific closed-beta blockers — 2026-07-18

- Collect consented, private 60/120/240 FPS validation media with compatible synchronized
  timing and spatial references; lock validation/holdout splits before tuning.
- Produce dual-review contact/toe-off/zone/athlete annotations and inter-rater results.
- Quantify timing, velocity, step, calibration, contact/flight and failure/rejection error.
- Calibrate confidence and recording-quality bands against actual error.
- Run cross-device, cross-FPS, VFR, dynamic-crop, pose and robustness studies.
- Complete blinded qualified-coach Root Cause/recommendation/priority/report review.
- Complete adult athlete comprehension/actionability testing.
- Validate prediction/projection outcomes prospectively or keep them hidden/experimental.
- Review subgroup performance gaps and all scientific/product claims externally.
