# AVA Sprint MVP release checklist

The machine-readable source is `config/mvp-release-checklist.json`. “Implemented” means
the repository path exists and has focused verification; it does not imply App Store,
legal, clinical, or field validation.

## Release gates

- Authentication: implemented; real email verification/reset testing remains.
- Ownership/RLS: implemented and exercised through a two-user local Playwright denial test.
- Upload: partial; validated session-first upload exists, resumable progress does not.
- Worker: blocked on staging deployment, secrets, monitoring, and capacity testing.
- Results: partial; trust contracts exist, athlete-facing consolidation remains.
- Timing: validated static behavior preserved; automatic panning timing is blocked.
- Privacy: consent/deletion-request foundations exist; legal review and deletion execution remain.
- Mobile/TestFlight: blocked because the repository has no native iOS delivery target.
- End-to-end tests: local golden-path suite passes; real upload/worker completion still needs isolated staging fixtures.
- Production environment: blocked on provisioned web/database/storage/worker environments.

No TestFlight build should be distributed until every blocked security, privacy, worker,
and iOS delivery item has an owner and evidence.
