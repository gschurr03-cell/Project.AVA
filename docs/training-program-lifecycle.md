# Training plan lifecycle and approval

States are requested, validation failed, planning, draft, review required, approved,
scheduled, active, paused, superseded, completed, cancelled and archived. Transition
authorization is explicit and blocking validation prevents approval. The engine emits only
`draft` with `approved=false`.

Coach approval records are typed/idempotent. Overrides record original/new values, reason,
reviewer, validation, new fingerprint and reapproval. Hard safety/clinician restrictions
cannot be overridden. Persistence, audit tables and endpoints remain unimplemented.

