# Native upload flow

Existing AVFoundation metadata/timestamp inspection, 60 FPS-class quality policy, streaming
fingerprint, background URLSession, progress state, retry policy and account-scoped
reconciliation are preserved. The backend now supplies a scoped signed upload and verifies
object existence/size before completion.

Remaining connection work requiring iOS target/device execution: concrete upload service
wiring to initiation/completion, background relaunch delegate integration and cancellation
UI. The API and portable contracts exist; a real native upload is not claimed.
