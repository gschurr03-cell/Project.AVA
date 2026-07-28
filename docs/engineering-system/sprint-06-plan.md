# Sprint 06 — Analysis and canonical result

Objective: real worker execution and immutable result compatibility.

Authoritative tasks: `AVA-0009`, `AVA-0018`, `AVA-0019`, `AVA-0028`, `AVA-0029`,
`AVA-0034`, `AVA-0045`, `AVA-0046`, `AVA-0047`, `AVA-0049`.

Only `AVA-0045` has no incomplete dependency and is independently ready. It must retire the
implicit mock backend from the generic production path while retaining explicit test/dev
injection. All other tasks require unfinished hosted-worker, result, telemetry, scientific
reference, baseline or predecessor work. Local audit and regression evidence may advance
their implementation record but cannot satisfy their live/scientific acceptance criteria.

Execution order for this pass:

1. Complete and verify `AVA-0045`.
2. Audit the existing durable job/worker/result lifecycle.
3. Run available local state, queue, analysis, result, orchestration and regression gates.
4. Preserve dependency-blocked tasks and document exact remaining evidence.
5. Do not begin Sprint 07.
