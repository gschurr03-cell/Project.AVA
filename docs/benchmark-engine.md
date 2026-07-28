# Elite Benchmark and Comparison Engine

The engine compares an athlete only with versioned, licensed, Research
Knowledge-approved population datasets. Population benchmarks are separate from AVA’s
single-video validation benchmarks and legacy product thresholds.

Its sequence is dataset validation → hard compatibility checks → population similarity
scoring → closest eligible group selection → percentile interpolation → descriptive
comparison output. Compatibility failures return “No valid percentile available.”

`BenchmarkDataset` records population, collection and measurement methods, protocol and
technology, FPS class, metric/phase/event definitions, inclusion/exclusion rules, sample
size, distributions, confidence, limitations, sources, review status, and version.
Entries store summary distributions and percentile landmarks. No elite values are seeded.

Personal and longitudinal trends use one compatible result group. Fingerprint similarity
requires matching compatibility keys, units, and at least two shared metrics. Similarity
is descriptive and never generates recommendations or priorities.

Reviewer-gated persistence and `/benchmarks` and `/comparisons` developer pages are
feature-gated. Visualizations render only stored active verified datasets.

