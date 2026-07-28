# Closed-beta critical path

1. **M0 — Reproducible baseline:** AVA-001, 030, 032. Gate: clean checkout reproduces web,
   worker, SQL and portable Swift gates.
2. **M1 — Isolated environment:** AVA-002–005, 011, 013. Gate: migrations, secrets, RLS,
   storage, restore and abuse tests pass.
3. **M2 — Analysis vertical:** AVA-009–010, 014–017, 026–029, 046. Gate: consented real
   60 FPS-class video completes with immutable safe report and observable recovery.
4. **M3 — Native vertical:** AVA-006–008, 025, 036. Gate: signed physical-device
   capture/upload/offline/result workflow passes.
5. **M4 — Safety and operations:** AVA-012, 016, 037–039. Gate: deletion, claim withholding,
   privacy/security/coach review and incident rehearsal pass.
6. **M5 — Coach-only closed beta:** small allowlisted adult cohort; training remains disabled.
   Gate: SLO, support and suspension criteria hold for a defined observation window.
7. **M6 — Training beta (later):** AVA-020–024, 043. Gate: durable coach-approved plan and
   safety-event lifecycle passes before any athlete execution.

Infrastructure, reference collection, API implementation and legal review can begin in
parallel after M0. Native live integration depends on API/staging; scientific exposure
depends on reference results; training is not on the first coach-beta critical path.
