# Intelligence Orchestrator

The Intelligence Orchestration Layer (IOL) coordinates deterministic intelligence
services. It contains no biomechanics, recommendation, coaching, scoring, projection, or
Digital Twin rules.

The registry is authoritative. `pipelinePredecessor` defines the synchronous analysis
chain; `dependencies` records the broader service/data requirements validated before an
adapter runs. Plans preserve the resolved graph, versions and input fingerprint so later
registry changes cannot silently alter an in-flight run.

Every engine is exposed through `EngineExecutionAdapter`: `prepare`, `validate`,
`execute`, `validateOutput`, `persist`, `activate`, and `complete`. Adapter `activate`
only stages a snapshot reference. The orchestrator alone commits the pipeline manifest.
Feature flags keep live execution disabled and shadow execution enabled during adapter
cutover.

Offline clients consume active immutable manifests and never enqueue work. Browser
clients cannot mutate plans, jobs, traces, retries, invalidations, audits or activation.

