# Human temporal contact review R1 — blinded-review handoff

## Scope

This packet supports a new blinded human review of all 11 Gav and 11 Vanni
contacts. It is evidence-only: production behavior and frozen truth are
unchanged.

## Reviewer instructions

Open only the randomized PNG strips in
`validation/artifacts/human-temporal-review-r1/` and complete
`blinded-review-template.json`. Do not open the frozen truth fixtures or
`review-key.restricted.json` before submitting the review.

Each image is sequential left-to-right then top-to-bottom. The small white
number is the strip position, not a source-frame number. For each code record:

- `contactExists`: `YES`, `NO`, or `AMBIGUOUS`
- `contactOnStripPosition` / `contactOffStripPosition`: numbered strip position
  or `null` if not visually isolatable
- `side`: `LEFT`, `RIGHT`, or `UNKNOWN`
- confidence fields: `HIGH`, `MEDIUM`, or `LOW`
- `observability`: `HIGH`, `MEDIUM`, or `LOW`
- `lowerLimbVisibility`: `CLEAR`, `DEGRADED`, or `AMBIGUOUS`
- concise source-only ambiguity notes

When the completed template is available, it can be reconciled with the
restricted key to calculate exact/±1/±2 repeatability, side agreement,
observability strata, and the human temporal noise floor.

## Integrity

The randomized image names and visible strip positions contain no AVA output,
prior human labels, contact frames, side labels, or confidence labels. The
restricted key maps review codes to the original fixture only for post-review
scoring.
