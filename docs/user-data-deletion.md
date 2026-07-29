# User data deletion

Session deletion removes the owned session and cascade-linked analyses from visible database
history, then attempts deletion of the private source video. A storage failure is logged as an
orphan-cleanup task so the user is not left with a visible broken session. The UI truthfully
states that deletion may not be reversible.

Independent analysis/report/source-video deletion is not currently supported. Reports are
authenticated views rather than public share tokens, so deleting the source session removes
access. There is no public report-share revocation workflow because public sharing is disabled.

Account deletion is manual and trackable. `/account` creates an idempotent
`account_deletion_requests` record after explicit confirmation. An operator must:

1. pause/cancel active jobs through service-role procedures;
2. inventory owned athletes, sessions, analyses, artifacts, support records, and consents;
3. delete private storage objects and reconcile failures;
4. delete/disable the auth account only after cleanup is evidenced;
5. update request status and retain only approved/anonymized operational evidence.

No cancellation window, automatic export, or immediate total erasure is claimed. Data export is
requested through the structured Support form.

