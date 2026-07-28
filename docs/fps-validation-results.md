# FPS and variable-frame-rate validation results

Deterministic tests cover 59.94/60-class acceptance, rejection below the supported class,
120/240 sampling onto 60 Hz, fractional metadata, timestamp evidence and preservation of
source FPS/index/timestamps without synthetic frames. Experimental 30 FPS remains isolated.

This validates software normalization behavior, not cross-FPS metric agreement. No
simultaneous same-sprint 60/120/240 or multi-device block exists, and long-duration VFR
drift has not been quantified on a governed dataset.

