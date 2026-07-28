# iOS offline beta results

`OfflineResultPackage` can now embed the complete manifest-scoped beta payload. Commit
validates account, athlete, analysis, active manifest, safety contract and fingerprint,
then decodes a pending file before atomic replacement. A partial or invalid sync never
replaces the previous complete package.

Screens must label offline/stale time, unavailable optional sections and unsupported
contracts. No intelligence runs offline. Full cache migration and bounded pruning remain.

