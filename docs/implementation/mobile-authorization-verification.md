# Mobile authorization verification

Every protected route validates the bearer token with Supabase, loads the profile, resolves
exactly one `athletes.user_id`, then filters upload/analysis/result/deletion queries by both
user and athlete. Service-role writes occur only after that check. Clients have SELECT-only
RLS on mobile lifecycle tables.

Covered locally by type/source invariants: missing bearer, invalid/expired user, no linked
athlete, cross-user upload/analysis/result IDs, incomplete upload and inactive/mixed result.
True athlete-A/athlete-B, disabled-account and storage-policy behavior must run against the
applied staging schema; that remains blocked with staging.
