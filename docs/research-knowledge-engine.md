# Research Knowledge Engine

AVA’s Research Knowledge Engine stores precise reviewed claims separately from athlete
measurements. Its chain is source → evidence link → claim → retrieval → optional
interpretation/recommendation/report attachment.

The engine is deterministic and versioned. Research may explain boundaries, add
citations, or downgrade an intervention evidence label. It cannot create a recommendation,
identify an unmeasured cause, increase biomechanics confidence, alter priority ranking,
or approve an internal discovery.

The initial searchable catalog is lexical plus structured filters and ranks evidence
grade, applicability, directness, review status, and relevance. No vector provider or LLM
is required. Development traces record inclusion and exclusion decisions.

The reviewer workspace is feature-gated and RLS-protected. Ordinary authenticated users
receive no research table access. Full-text ingestion, external metadata imports, and
automated extraction remain disabled until their operational and copyright controls exist.

