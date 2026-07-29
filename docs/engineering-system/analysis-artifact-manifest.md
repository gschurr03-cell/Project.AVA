# Analysis artifact manifest

Artifact manifests bind each private artifact to the canonical analysis/job attempt,
pipeline/model versions, purpose, storage reference, media type, integrity metadata and
retention class. Required result persistence must succeed before completion. Optional debug
artifacts do not become user-visible by default and must never contain credentials.
