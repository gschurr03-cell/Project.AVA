# Completion scoring model

Weights by major subsystem: architecture 10%, implementation 25%, integration 20%,
automated tests 15%, real-environment tests 10%, security/safety review 7.5%, scientific
validation where applicable 7.5%, operations 2.5%, release evidence 2.5%. For non-scientific
systems its weight moves to security/real-environment review.

Caps:

- implementation without integration cannot exceed 50%;
- native without device evidence cannot exceed 60%;
- operational capability without deployment cannot exceed 50%;
- scientific output without eligible reference validation cannot exceed 35%;
- release readiness cannot receive credit from documents alone.

The normalized tracker retains the audited baseline: overall 56%, backend 72%, native 38%,
scientific validation 18%, training 34%, security 48%, operations 31%. Batch 1 work is
In Progress and does not change the program baseline until staging/device evidence satisfies
definition of complete.

## Sprint 01 recalculation — 2026-07-18

`AVA-0039` and `AVA-0040` are Verified Complete, but their local release-control and lint
evidence does not satisfy the remote/staging dimensions needed to move a rounded major
subsystem score. Overall and subsystem percentages therefore remain unchanged. Sprint 01 is
40% complete by task count; remaining priorities are P0 19, P1 22, P2 6 and P4 1.

## Sprint 02 recalculation — 2026-07-18

No assigned Sprint 02 task is Verified Complete, so overall and subsystem scores remain
unchanged. M1 remains 0%. Newly discovered `AVA-0051` increases remaining P1 work to 23 and
changes M0 task-count progress to 33%; it does not reduce already accepted Sprint 01
evidence.

## Sprint 03 recalculation — 2026-07-18

No assigned Sprint 03 task is Verified Complete. Local adapter, database, web, worker and
Swift contract evidence does not substitute for missing staging, hosted-worker, canonical
result or scientific-validation evidence. Overall and subsystem scores, milestone progress,
and remaining P0/P1 counts therefore remain unchanged at 56%, M2/M3/M6 0%, P0 19 and P1 23.

## Sprint 04 recalculation — 2026-07-18

No Sprint 04 task is Verified Complete. Portable native tests and architecture documentation
do not replace staging, signed archive, simulator, physical-device, accessibility or
symbolicated-crash evidence. Overall/subsystem scores and milestones remain unchanged:
overall 56%, native 38%, M2/M6 0%, remaining P0 19 and P1 23.

## Sprint 05 recalculation — 2026-07-19

Both assigned tasks gained substantial local implementation and passing evidence, but neither
meets its tracker acceptance criterion. Under the implementation-without-live-integration
cap and task completion rules, no rounded program/subsystem or milestone credit is awarded:
overall 56%, backend 72%, native 38%, M2 0%, remaining P0 19 and P1 23.

## Sprint 06 recalculation — 2026-07-19

`AVA-0045` is Verified Complete and Sprint 06 is 10% complete by task count. This small P2
fail-closed safety seam has no deployed-integration evidence and does not move a rounded
weighted subsystem or overall score. Overall remains 56%; backend 72%; native 38%;
scientific 18%; security 48%; operations 31%. Remaining P0/P1 remain 19/23.
