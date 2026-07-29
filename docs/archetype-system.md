# Movement archetype system

Movement archetypes are experimental, descriptive, multi-label summaries. They are not
genetic classifications, personality types, performance predictions, or training
prescriptions.

Supported labels are Power Accelerator, Frequency Dominant, Stride Dominant, Balanced
Sprinter, Elastic Runner, High Variability, Late Developer, Technical Specialist, and
Unknown.

V1 never derives an archetype from raw landmarks or hidden “elite” thresholds. It accepts
explicit structured signals from compatible, versioned upstream evidence. Each signal has
a confidence, source version, and supporting event IDs. The deterministic mapping groups
signals by label and averages their confidence.

Athletes may hold several labels simultaneously. Each snapshot appends the observed label
and confidence to its archetype history. A label disappearing from a later snapshot does
not erase its prior presence. Stability is therefore auditable across snapshots.

The dashboard must show the experimental status and supporting evidence. With no valid
signals, it shows no archetype rather than assigning “Unknown” as if it were a finding.

