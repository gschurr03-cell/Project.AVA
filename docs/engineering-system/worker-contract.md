# Worker contract

Production workers must use the packaged MediaPipe backend explicitly. The generic
`processVideo` entry point has no implicit backend and fails closed when none is supplied.
Mocks remain available only through explicit test/development construction.

The worker validates environment and model files, atomically claims one durable job,
heartbeats its lease, retrieves the server-controlled private video, normalizes accepted
sources onto the validated 60 FPS clock, persists versioned results/artifacts, and completes
or fails via claim-token-checked RPCs. It never fabricates metrics or exposes signed URLs,
tokens, raw profiles or user-visible stack traces.
