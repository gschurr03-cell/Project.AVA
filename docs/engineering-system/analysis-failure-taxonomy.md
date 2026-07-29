# Analysis failure taxonomy

Stable categories are unavailable upload/object, object mismatch, unsupported media, decode
failure, insufficient frames, athlete detection, calibration, pose/model initialization,
tracking, configuration, timeout, cancellation, worker interruption, persistence, artifact
and internal unknown.

Transient infrastructure, storage and worker-interruption failures may retry within the
stored attempt limit. Invalid input, scientific ineligibility, unsupported media and
cancellation are terminal. APIs expose only safe code, message, retryability and user action;
raw Python/provider errors remain internal.
