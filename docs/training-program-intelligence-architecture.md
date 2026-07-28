# Training Program Intelligence architecture

Training Program Intelligence is a deterministic server engine consuming one active
manifest, upstream recommendation/priority/optimization/coaching/Digital Twin references,
athlete context, availability, facilities, history, readiness, restrictions and competition.
It outputs an immutable, validated, non-authoritative draft.

Pipeline: contract validation → eligibility → objective graph → phase/context → weekly
structure → catalog/template instantiation → exposure/readiness/restriction/taper rules →
validation → explanation/provenance → staged draft snapshot. Every failure is explicit.

The engine cannot alter upstream intelligence, diagnose, clear medical restrictions,
invent exercises, activate plans, or update the Digital Twin directly. Drafts use a linked
planning lifecycle and future separate approved-plan pointer rather than the analysis
manifest pointer. AVA Lift and Motion IQ are optional sourced adapters; absence is valid.

`TrainingProgramService` is the server-only authorization boundary for idempotent draft
requests, scoped retrieval/history and review decisions. It rejects owner/athlete scope
mismatches and client engine selection. A durable store and HTTP routes are intentionally
deferred; arbitrary rule/catalog mutation and direct activation are not exposed.
