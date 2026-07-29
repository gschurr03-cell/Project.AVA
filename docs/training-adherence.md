# Athlete adherence events

Versioned account/athlete/plan/session-scoped events support completed, partial, skipped,
modified, pain, excessive fatigue and coach-adjustment-requested states. They contain
completion fraction, optional perceived intensity, quality status, bounded notes category,
time and idempotency key. Events inform later review; they do not immediately regenerate or
activate a plan.

