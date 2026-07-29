# Video retention

Current draft policy version: `ava-video-retention-draft-v1`.

Source video is retained with its session for processing, timing review, and supported reruns.
No automatic retention period is configured. Derived results and artifacts remain with the
session. Independent source-video deletion is unavailable; session deletion attempts source
cleanup after deleting the owned database record.

Private videos are accessible only through ownership controls, short-lived signed access, and
authorized processing services. Protected reports do not expose storage URLs. Beta video is not
used for model training, model-improvement consent is not collected, and no training-data
ingestion exists. Legal/policy approval and an operational retention schedule remain external
beta gates.

