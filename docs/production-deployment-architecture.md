# Production deployment architecture

Actual components are a Next.js web/API runtime, Supabase Auth/Postgres/private Storage,
Postgres-backed analysis and intelligence queues, a CPU MediaPipe analysis worker, and the
native iOS client. No GPU or text-model dependency is required for authoritative analysis
or training logic.

The worker image pins Node 22, verifies the MediaPipe model checksum, runs non-root, uses
isolated bounded `/tmp`, exposes `/live` and `/ready`, heartbeats leases, retries bounded
failures, and handles termination. It needs outbound Supabase/storage access and service-role
credentials. Web and worker hosting/scaling providers are not selected; therefore compute,
network, autoscaling and deployment manifests remain blocked rather than invented.

The web runtime emits anti-content-sniffing, frame denial, strict referrer, bounded browser
permissions, opener isolation and DNS-prefetch controls. Closed beta and production add
one-year HSTS. CSP requires a tested deployment-specific source inventory before activation.
