# Offline coaching policy

AVA’s portable offline envelope contains the complete cached `CoachingState` plus IDs for
reports, recommendations, benchmarks, projections, the drill-library version, sync time,
and supported queued mutation types.

Offline clients may render cached focus, monitoring, history references, trends,
notifications, reports, drills, and cues without recomputation. They may queue adherence,
notes, coach feedback, reminders, and uploads for later synchronization.

The envelope is a contract, not a finished mobile sync implementation. The current
repository still lacks native persistent storage, service-worker caching, upload queues,
mutation conflict resolution, encryption-at-rest policy, and sync retry infrastructure.
Until those exist, the web application must not claim complete offline operation.

On reconnect, queued mutations become versioned structured events. They must not directly
edit a cached CoachingState. The server processes an explicit invalidation, recomputes
from the latest Digital Twin and source versions, stores a new immutable state, and then
updates the active pointer.

