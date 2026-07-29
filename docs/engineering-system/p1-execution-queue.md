# P1 closed-beta execution queue

Newly discovered `AVA-0051` is blocked behind `AVA-0030` and scheduled for Sprint 11. It
must make the existing orchestration assertions visible to the canonical pgTAP runner
without weakening them.

- Backend/architecture: AVA-0018, 0019, 0046, 0047, 0049.
- Native/upload: AVA-0025, 0026, 0027, 0036.
- Worker/quality: AVA-0028, 0029, 0030, 0031, 0032, 0033, 0034.
- Security: AVA-0035.
- Scientific/coach review: AVA-0024.
- Training (after M3): AVA-0020, 0021, 0022, 0023.

Execution order is immutable-result compatibility; upload/device reliability; worker and CI
evidence; security hardening; scientific/coach review. Training remains deferred until
authorization and scientific gates support it.
