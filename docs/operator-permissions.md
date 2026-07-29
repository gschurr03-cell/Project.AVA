# Operator permissions

Normal authenticated users may manage their onboarding state, create/read their own support and
feedback records, request their own account deletion, and manage only owned athlete/session data.
They cannot edit their role, read the operator dashboard, process deletion requests, edit support
workflow state, write audit events, or access the service-role analysis queue.

Admins may read the operations dashboard and update support/deletion workflow records under RLS.
The current UI is read-only and exposes no arbitrary status editor, role editor, user browser,
feature-flag writer, retry button, or raw diagnostics. Service-role worker/job mutations remain
backend procedures. Sensitive actions must append a sanitized `beta_audit_events` record when a
future transactional action endpoint is added.

