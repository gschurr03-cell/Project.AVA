# AVA Interpretation language safety

Interpretation text must remain cautious, non-medical, non-judgmental, and descriptive.
Templates—not an LLM—produce athlete-facing and technical text.

## Preferred language

- may reflect
- is consistent with
- could indicate
- appears
- suggests
- cannot determine
- requires confirmation
- is limited by

## Restricted assertions

Generated title, summary, explanation, and likely-meaning text is rejected if it contains
unsupported assertions such as:

- caused by
- proves or definitely
- injury risk
- dysfunctional
- optimal, elite, or perfect
- dangerous
- inefficient

These terms may appear inside structured excluded conclusions only when negated, such as
“Cannot diagnose injury.” Exclusions are guardrails for future presentation and LLM
boundaries, not athlete-facing claims.

## Causal boundary

Alternative explanations are typed possibilities. They are never converted into a proven
cause. For example, an asymmetry may preserve fatigue, mobility difference, strength
difference, recording angle, and normal variability as possibilities while explicitly
excluding injury diagnosis, confirmed weakness, pain identification, force inference, and
rehabilitation prescription.

## Testing

The focused suite checks every rule template and every generated athlete-facing field
against the restricted-assertion patterns. It also verifies that structured alternatives
and excluded conclusions exist for every rule.
