# Session and microcycle validation

Session validation covers objective/template compatibility, catalog approval, feature gate,
training age, equipment/facility, restrictions, duration, dosage bounds, contraindications,
and selection trace. Microcycle validation covers competition protection, key-day recovery,
high-intensity count, weekly exposure and review items.

V1 does not yet validate completed-versus-adjusted exposure from a durable event store,
all possible exercise duplication, empirically calibrated volume ceilings, or multiweek
progression. Invalid weeks are rejected before snapshot creation.

