# Web MVP launch-readiness matrix

Audit date: 2026-07-28. Scope: existing web application, Supabase backend/storage,
analysis worker, migrations, and deployment documentation. Native application work is
excluded.

Statuses are based on traced routes, authorization boundaries, migrations, workers, and
tests—not filenames alone.

| Area | Status | Severity | Evidence | Remaining action |
|---|---|---:|---|---|
| Authentication | Complete for internal beta | High | Email signup/login, verification callback, refresh middleware, reset, logout, protected-route redirect, safe auth errors | Verify production SMTP templates and redirect allowlist |
| Athlete profiles | Functional, incomplete | Medium | Owner-scoped CRUD, optional bounded metric/PB/goal fields, database constraints | Event and sex editing are not exposed; add only when a validated comparison consumes them |
| Session management | Functional, incomplete | Medium | Owner-scoped list/detail/rename/notes/delete, immutable working/saved versions | No archive state; delete is immediate after UI confirmation |
| Video upload | Functional, incomplete | High | Owner-scoped private storage, 512 MB client/worker bound, MP4/MOV/M4V validation, retry-safe session ID, consent | No byte-level progress or cancellation; duration is enforced by worker after upload |
| Calibration and timing | Complete | Critical | Confirmed authority/revision persistence, dedicated workspace, read-only analysis view, concurrency and refresh tests | Real-device usability validation remains |
| Analysis creation | Complete | Critical | Server ownership check, explicit source-video prerequisite, one working analysis/session, one job/analysis, immutable input snapshot | First pose pass may precede confirmed spatial calibration by design |
| Worker lifecycle | Complete for one-worker beta | Critical | Durable queue, leases, heartbeats, bounded retries, stale recovery, dead letter, safe status RPC, health server | Select worker host and rehearse operator dead-letter recovery |
| Analysis progress | Complete | High | All worker statuses normalized, refresh-safe polling, monotonic weighted model, retry/failure states | Browser E2E under forced worker interruption remains staging work |
| Five metrics | Complete within validated protocols | Critical | One trusted metric adapter, stationary/panning protection, centralized report definitions | External scientific validation gates remain binding |
| Measurement quality | Complete | High | Calibration, recording, pose, sample, warnings, unavailable/invalid withholding | Continue validation on supported real-world capture matrix |
| Limiting Factors | Complete for validated asymmetry model | High | Deterministic ranked asymmetry evidence and confidence | Individualized length/frequency targets intentionally unavailable |
| Sprint Intelligence | Complete | High | Deterministic structured reasoning, evidence/counter-evidence, assumptions, missing inputs, versions | Broader conclusions depend on validated target models |
| Coaching Recommendations | Complete | High | Limiter-linked, ranked, deduplicated, conditional physical language, 2–3 limit | No injury-profile source is connected |
| Professional reports | Functional, incomplete | High | Private route, five metrics, intelligence, recommendations, print/PDF, versions | No persisted report repository, server PDF, or secure public share |
| History and persistence | Functional | High | User-scoped session list, active/failed/complete states, analysis date, report state, saved versions | Compact history does not duplicate metric values; list is capped at 60 and needs cursor pagination before high-volume rollout |
| Navigation | Complete for MVP | Medium | Customer routes in sidebar; developer/parameter-only dead links removed | Feature-flagged internal routes still exist but are not production navigation |
| Responsive web | Functional | Medium | Mobile drawer, responsive cards/tables, report overflow handling, tappable controls | Real-device/browser matrix not yet executed |
| Loading/empty/error states | Functional | Medium | Root loading/error boundaries and major route-specific states | Some server-action errors still use generic redirects |
| Security | Functional after remediation | Critical | RLS, server ownership checks, private storage, signed worker access, secret scan, production flag policy | Rotate credentials formerly embedded in tracked build artifacts; deploy CSP after source inventory |
| Privacy | Functional for internal beta | High | Consent, private storage, deletion-request workflow, draft notice | Operator deletion SLA, retention schedule, and completed deletion automation need approval |
| Legal/support | Blocked for external beta | High | Draft Privacy/Terms, truthful support page, medical limitation language | Legal approval and a monitored support contact are external requirements |
| Accessibility | Functional, incomplete | Medium | Semantic forms/headings, focus states, status text, aria-live upload, accessible report tables | No WCAG audit, screen-reader matrix, or dialog focus audit |
| Performance | Functional | Medium | Direct-to-storage upload, bounded history, server components, terminal polling stop, 102 KB shared JS at audit build | Measure production Web Vitals and database query latency |
| Observability | Functional, incomplete | High | IDs, structured worker logs, redaction, health/readiness, retry/dead-letter records | Configure hosted log aggregation and alerts |
| Environment/configuration | Complete in code | Critical | Typed validation, canonical app URL, managed-origin rules, production feature policy, version | Populate and verify staging/production secrets externally |
| Database/migrations | Complete by static/integration checks | High | Ordered migrations, RLS, FKs, partial unique indexes, queue indexes, nullable legacy handling | Fresh remote/staging migration rehearsal still required |
| Deployment | Blocked externally | Critical | Local commands, worker image/runbook, health endpoint, rollback procedure | Select hosts, configure domain/HTTPS/SMTP/storage limits, rehearse deploy/rollback |
| Legal launch content | Functional, incomplete | Medium | Scientifically cautious landing/report/recommendation copy | Product/legal copy review remains |

## Completion estimates

| Capability | Estimate |
|---|---:|
| Metric Engine | 98% |
| Calibration and Timing | 97% |
| Upload | 85% |
| Analysis Lifecycle | 94% |
| Analysis Progress | 97% |
| Analysis Experience | 92% |
| Limiting Factors | 88% |
| Sprint Intelligence | 94% |
| Recommendations | 93% |
| Reports | 88% |
| Authentication | 91% |
| Profiles and Sessions | 87% |
| History and Persistence | 84% |
| Security | 86% pending credential rotation |
| Privacy and Legal | 62% |
| Accessibility | 76% |
| Deployment | 58% |
| Overall Web MVP | 87% |
| Xcode Transition Readiness | 72% |

## Launch decision

- Local development: ready.
- Controlled internal beta: code-ready after credential rotation and a fresh staging
  migration/smoke rehearsal.
- External beta: not ready. Legal approval, monitored support, production SMTP,
  deployed infrastructure, CSP validation, retention/deletion operations, and real-device
  accessibility/browser testing remain.
- Public launch: not ready.

The highest-priority next phase is a staging deployment and operations rehearsal—not native
application development.
