# Root Cause-to-Recommendation Shadow Validation

Shadow records compare baseline IDs and order with proposed context and scores. Because
shadow never mutates Recommendation output, recommendation count, membership, order,
status, safety, and wording must remain identical.

Review mapping coverage, unmapped/ambiguous rates, proposed modifiers, confidence-gate
rejections, protected-class attempts, coach confirmation/rejection, fail-closed rate, and
catalog gaps. Metrics remain first-party stored aggregates; no third-party analytics are
introduced.

Bounded activation is not recommended until shadow and advisory datasets demonstrate
stable ordering, zero eligibility creation, zero safety bypass, acceptable mapping
governance, and deterministic replay across catalog and registry versions.
