# Sprint 05 readiness review

Review date: 2026-07-19.

| Task | Priority / severity / effort | Status | Dependencies | Hard blocker | Locally achievable scope | Live scope |
| --- | --- | --- | --- | --- | --- | --- |
| AVA-0026 — Resumable/idempotent uploads | P1 / S2 / L | In Progress | AVA-0006 | deployed mobile provider | persistence, state/reconciliation, destination validation, DTOs, progress, cancellation, retry/idempotency tests | kill/relaunch/network-loss against canonical storage |
| AVA-0027 — Storage lifecycle/orphan reconciliation | P1 / S1 / M | In Progress | AVA-0012, AVA-0026 | complete deletion lifecycle and live storage inventory | local account-scoped media/orphan policy and tests | zero unexplained orphan classes across DB/storage/derived records |

Both tasks have valid stories, boundaries, acceptance criteria, test requirements, release
stages and dependencies. They remain In Progress: neither is wholly blocked, but neither is
ready for Verified Complete.
