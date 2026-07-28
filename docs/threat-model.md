# Threat model

| Threat | Likelihood / impact | Existing control | Remaining mitigation / owner |
| --- | --- | --- | --- |
| Account or coach takeover | Medium / high | Supabase sessions, recovery | MFA/anomaly/revocation tests; security |
| Cross-athlete access | Medium / critical | RLS, ownership tests | staging BOLA matrix; backend |
| Stolen upload URL/malicious video | Medium / high | private bucket, scoped paths, worker validation | short upload grants, signature/quarantine, rate limits; platform |
| Expensive analysis abuse/DoS | High / high | durable queue, bounded retries | distributed quotas/admission control; platform |
| Plan approval/restriction bypass | Medium / critical | lifecycle and rule precedence | persisted authorization/integrity gateway; training |
| Offline replay/stale plan | Medium / high | idempotency, expiry/revocation contracts | real device/server reconciliation; mobile |
| Diagnostic/log leakage | Medium / high | disabled flags, redaction library | central collector policies/tests; security |
| CI/dependency compromise | Medium / critical | lockfile, restricted CI permissions, SBOM | SHA-pin actions, scanners/signing; platform |
| Destructive migration/ransomware | Low / critical | ordered migrations | tested backups/restore/least privilege; platform |
| Provider/region outage | Medium / high | retry/dead letter models | deployed alerts, recovery topology; platform |

Beta remains NO-GO while critical remaining mitigations lack staging evidence.

