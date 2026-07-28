# Documentation truth audit

The repository has extensive architecture, safety, validation, native, training and
operations documentation. Much is thoughtful and explicitly conservative. The main risk is
volume: design intent, implemented contract, local test result and deployed evidence are
distributed across ~270 documents.

## Truth corrections

- “implemented” often means a pure module or fixture, not a connected workflow.
- Native API documents describe a contract whose provider is absent.
- CI and runbooks are definitions, not observed protected-branch/deployment evidence.
- Scientific validation framework and registries do not constitute validation.
- Training architecture does not constitute a persisted coach/athlete product.
- Production-shaped worker code does not constitute a production runtime.
- Percentage claims from prior prompts must be superseded by the weighted scorecard.

Every system document should carry status, last verified date, owner, canonical code/schema,
test evidence, deployment evidence and superseding document. This audit is the current
engineering source of truth until implementation changes.
