# Orchestration retry policy

Retries are bounded, deterministic and disabled independently by feature flag. Version 1
allows at most three total attempts with fixed exponential retry delays of 1 and 2
seconds (the formula is capped at 30 seconds).

Only failures explicitly classified `deterministic_transient` are retried. Validation,
missing dependency, contract, unsupported version, infrastructure, cancellation and
unknown failures fail closed. This prevents retries from hiding invalid data or creating
different domain results. Every retry persists its attempt, classification, code and
delay. Exhaustion fails the job and prevents activation.
