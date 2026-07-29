# Authorization model

Default deny. Supabase Auth establishes identity; server routes and RLS establish account/
athlete ownership. Coach access requires an owned athlete relationship. Service-role queue
and activation RPCs are not client callable. Athletes cannot approve coach-required plans;
clinician restrictions outrank coaches and preferences; diagnostics require an internal
authorized role and server flag.

Every operation must evaluate principal, account, athlete/organization relationship, role,
resource lifecycle, plan/restriction authority, and beta cohort. Existing ownership and RPC
tests cover important paths, but a complete centralized policy adapter and staging
cross-organization matrix remain blockers.

