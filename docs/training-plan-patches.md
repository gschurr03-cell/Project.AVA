# Training plan patches

`TrainingPlanPatch` records source and target versions, trigger, narrow typed operations,
old/new values, rules, validation, approval, effective date, provenance, and fingerprint.
Target version must increase and an empty patch is invalid. Applying and persisting patches
is deferred; active snapshots are never mutated in place.

