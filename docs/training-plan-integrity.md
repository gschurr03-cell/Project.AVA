# Training-plan integrity

Execution requires matching account/athlete, approved active/scheduled lifecycle, current
revision, expected fingerprint, source/rule/catalog/validation versions, and no restriction
conflict. Drafts, unapproved patches, stale revisions, client-generated substitutions,
cross-athlete plans and historical mutation fail closed.

The integrity evaluator is contract tested. Persisted plan/event tables, server execution
gateway, coach authorization and native staging validation remain blocked.

