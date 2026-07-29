# Batch 01 audit mapping

| Backlog | Finding | Target/evidence | Files | Status |
| --- | --- | --- | --- | --- |
| AVA-002 | No isolated staging | Prepare fail-closed environment contract | env/docs | Blocked: provider account absent |
| AVA-003 | No managed secrets | No secrets in source/client; server-only config | env/API | Partial |
| AVA-004/032 | Migrations/schema drift unproved | Add migration 0053; clean local DB requested | migration/types | Local execution pending/blocked by runtime |
| AVA-005 | Authorization matrix incomplete | Bearer validation + explicit user/athlete/object matching | API/migration/tests | Implemented locally |
| AVA-006 | `/api/mobile/v1` absent | Versioned auth/profile/capabilities/upload/analysis/result/delete | routes/mobile library | Implemented locally |
| AVA-007 | Native disconnected | Typed envelope, services, environment validation | Swift core/tests | Partial; no device/provider |
| AVA-008/025 | Signing/device absent | Record exact device blocker | iOS/docs | Blocked externally |
| AVA-009 | Hosted real worker absent | Preserve canonical job pipeline; run config check | worker/docs | Hosted/video run blocked |
| AVA-010/036 | Telemetry deployment absent | Correlation/redaction/log contracts | API/Swift/docs | Local only |
| AVA-011 | Restore unproved | Document executable process and blocker | docs | Execution blocked |
| AVA-012/027 | Deletion incomplete | Owned idempotent source/pose/session cleanup + audit | API/migration | Implemented; staging proof blocked |
| AVA-016/017 | Safe immutable result read absent | Complete result/provenance integrity and allowlist | API | Implemented locally |
| AVA-026 | Upload idempotency/recovery | Unique keys, signed URL, server object/size verification | API/migration/native | Partial; resumable device proof blocked |

Deferred intentionally: training, orchestration cutover, new metrics, public projections,
full report UI, subscriptions, Android, public launch, scientific threshold changes.
