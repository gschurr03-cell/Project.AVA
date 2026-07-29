# Activated and offline result integrity

A result is complete only when backend status is complete and a compatible, authoritative,
active manifest matches the athlete and analysis, contains a non-empty integrity
fingerprint, and references the required coach report. Shadow, staged, invalidated,
rolled-back, partial, incompatible, and cross-account results fail closed.

`OfflineResultPackageStore` validates analysis/athlete/resource relationships and the
manifest fingerprint, writes a pending package atomically, decodes it, then replaces the
previous package. Incomplete downloads never replace a previously valid package. Packages
are immutable, account scoped, and schema versioned. Content-digest verification beyond
the manifest/reference metadata awaits a backend digest contract.

