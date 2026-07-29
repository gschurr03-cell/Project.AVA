# iOS performance profile

No device performance measurements exist. Instrument capture startup/finalization,
targeted timestamp verification, streaming SHA-256, memory/CPU/battery, storage growth,
upload throughput, package download, cold launch, and offline report loading.

Initial internal targets—not measurements—are: capture ready under 2 seconds, review
verification under 3 seconds for typical clips, bounded verification memory under 100 MB,
offline report under 300 ms, and no whole-video memory load. Fingerprinting streams 1 MiB
chunks, producing constant memory use at the cost of one full sequential file read. Record
results per device; one device cannot establish fleet performance.

