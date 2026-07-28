# Sprint 05 upload architecture audit

The canonical flow is:

selected/captured file → AVFoundation inspection → recording-quality eligibility →
account-scoped local media + SHA-256 → persisted logical upload/idempotency key →
authenticated `/api/mobile/v1/uploads` → server-owned object path/signed authorization →
URLSession file transfer → server object-size confirmation → canonical upload status.
Analysis submission remains a Sprint 06 boundary.

Existing reusable components include `VerifiedMediaInspector`, `RecordingQualityVerifier`,
`LocalMediaStore`, `MediaFingerprinter`, `UploadStateMachine`, `UploadRetryPolicy`,
`UploadReconciler`, background URLSession transfer, typed mobile API envelopes, server-side
authentication/ownership and the `mobile_uploads` table.

Focused gaps found and addressed locally:

- no concrete portable `UploadPersisting` implementation;
- no stale-attempt/monotonic progress guard;
- no explicit signed-destination/header/expiry validator;
- no typed native initiate/status/confirm adapter;
- repeat initiation returned no renewed destination and did not reject altered metadata;
- status/completion routes leaked database snake_case into a camelCase native contract.

Remaining gaps are iOS picker/UI integration, a complete transfer coordinator, full Xcode
background transfer, local storage-service E2E, deployed staging, device relaunch/network
loss and global orphan reconciliation. No competing upload source of truth was introduced.
