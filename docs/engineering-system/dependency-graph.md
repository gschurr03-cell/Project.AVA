# Dependency graph

```text
M0 reproducible baseline
 ├─> M1 isolated staging ─> migrations/RLS ─> restore + telemetry
 ├─> M2 mobile API ─> native auth ─> upload ─> worker ─> canonical result ─> device
 └─> M3 reference cohort ─> metric validation ─> claims/confidence gates

M3 safe priorities + M1 authorization
 └─> M4 training store ─> coach approval ─> native execution/safety events
     └─> M5 coach operations ─> M6 closed-beta gates ─> M7 cohort
         └─> M8 TestFlight ─> M9 public launch
```

Root blockers are AVA-0001–0005, 0010–0011 and external staging access. Scientific
collection can run parallel to infrastructure. Native UI work can use contracts, but cannot
close before staging, signing and device evidence. Training domain review can run in
parallel, while persistence/activation waits for authorization and safe metric inputs.
Validation found no circular hard dependency.
