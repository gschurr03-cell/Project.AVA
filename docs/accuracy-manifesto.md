# AVA Accuracy Manifesto

Status: **Canonical and normative**  
Applies to: Project AVA and every product, service, model, data system, and client built
from the AVA platform

This manifesto is one of Project AVA's highest-priority engineering references. It governs
every future feature, algorithm, model, AI system, database, benchmark, recommendation
engine, user interface, and architecture decision. Product requirements and implementation
plans must be interpreted consistently with it. A change that violates this manifesto is
not ready to merge or release.

## Confidence and validation are independent

Confidence describes the evidence for a particular result; validation status describes the
model's external validation and compatibility class. Strong experimental confidence never
makes a metric validated. AVA must persist and present both and must not merge incompatible
validation classes by default.

## Mission

AVA exists to provide trustworthy sprint-performance analysis.

The goal is not to produce the fastest-looking numbers. The goal is to produce the most
trustworthy numbers. Every engineering decision must favor athlete trust over artificially
impressive output. When uncertainty exists, AVA communicates it instead of hiding it.

**Trust is the product.**

## 1. Never fabricate data

AVA must never invent joint angles, velocities, stride lengths, contact times, flight
times, acceleration, top speed, recommendations, muscle weaknesses, or limiting factors.

If a metric cannot be measured confidently, AVA must withhold it unless an explicitly
approved and versioned model supports the estimate. Estimated and predicted values must be
identified as such and may never be presented as direct observations.

Unavailable is always better than incorrect. Missing data must be represented explicitly,
not replaced with zero, a benchmark, a population average, a visually plausible number, or
another placeholder that can be mistaken for a measurement.

## 2. Raw measurements are sacred

The biomechanics engine produces raw analytical measurements. Those values must never be
overwritten by reporting, display, correction, or compatibility logic.

AVA must distinguish and preserve:

- **Raw values:** the unmodified output of an identified analytical process.
- **Reported values:** policy-governed values AVA officially reports.
- **Displayed values:** presentation-only representations of reported values.

These layers must be stored or derivable without ambiguity. Calculations must never consume
formatted display strings. Historical analysis must preserve its raw measurements, source
media, input snapshot, provenance, and policy identities so an approved future pipeline can
reprocess it without pretending the new result was the original one.

## 3. Be conservative whenever uncertainty exists

When the evidence supports a range and AVA must choose between reporting slightly faster
or slightly slower performance, AVA reports the slower value. The same conservative posture
applies to timing, velocity, confidence, recommendation strength, and predictions.

Conservatism must be implemented through documented, versioned policy rather than ad hoc
rounding. It must not alter raw evidence. AVA never exaggerates athlete performance merely
because the larger number looks more compelling.

## 4. Displayed numbers must agree

No displayed metric may contradict another. Every relationship exposed to the athlete or
coach must remain mathematically coherent at the reported precision. For example:

```text
distance / reported time = reported velocity
```

When several displayed values participate in a relationship, the authoritative calculation
must define their precision and reporting policy together. The UI must not independently
recompute or round a related metric in a way that breaks that relationship. Users should be
able to verify AVA's calculations themselves.

## 5. Every metric must be explainable

Every reported value must answer: **Where did this come from?**

AVA's production reasoning chain is:

```text
video
  → detected events
  → biomechanical measurements
  → performance limitation
  → observed movement pattern
  → likely movement cause
  → associated muscle groups
  → supporting evidence and confidence
  → suggested intervention
  → retest plan
```

Each link must be traceable to identified inputs, formulas, thresholds, models, versions,
and evidence. AVA must withhold a downstream conclusion when a required upstream link is
missing. Black-box output is not acceptable merely because it appears plausible.

## 6. Association is not diagnosis

AVA analyzes movement; it does not diagnose injury, weakness, tissue capacity, disease, or
medical conditions. Video evidence alone cannot establish those diagnoses.

Acceptable language preserves the distinction:

> This movement pattern is commonly associated with hamstring and glute function.

Unacceptable language converts an association into a diagnosis:

> Your hamstrings are weak.

Every conclusion and recommendation must be classified in language the user can understand:

- **Observed:** directly measured or visibly detected in this analysis.
- **Likely:** supported by the observation and an approved evidence mapping.
- **Possible:** plausible but not established by the available evidence.
- **Experimental:** based on a hypothesis or system that has not met production validation.

Health, injury, rehabilitation, and clinical claims require separate review and may not be
inferred from performance analysis.

## 7. Confidence propagates downward

Low-confidence measurements cannot generate high-confidence recommendations. Confidence
must flow through the complete reasoning chain:

```text
measurement
  → limitation
  → cause
  → muscle association
  → recommendation
  → prediction
```

A downstream confidence may remain equal to or fall below the confidence supported by its
dependencies; it may not silently exceed them. Combining multiple uncertain links must not
produce artificial certainty. Withheld upstream evidence requires the dependent conclusion
to be withheld or explicitly downgraded.

Confidence values must identify their inputs, method, calibration, and limitations. A
confidence label is not a substitute for validation.

## 8. Maintain one source of truth

Every production metric must have one authoritative calculation and one owned definition.
AVA must avoid duplicate implementations, conflicting formulas, hidden UI calculations,
and recomputation from formatted values.

Shared policy belongs in a centralized, named, tested module. UI code consumes domain
results; it does not redefine biomechanics. Recommendation engines consume authoritative
measurements; they do not reconstruct them. Compatibility adapters may translate shape,
but they must not change meaning or become a second calculation path.

Experimental implementations must be isolated, labeled, and prevented from entering
production persistence or trusted history until formally promoted.

## 9. Version everything that affects meaning

AVA must persist independent versions for every component that can change a result's
meaning, including:

- analysis pipeline;
- pose model and runtime;
- metric schema;
- timing and reporting policy;
- benchmark database;
- prediction model;
- recommendation engine;
- research and evidence database.

Versions are part of analytical identity, not optional debug metadata. Historical analyses
must remain reproducible and must not be compared as equivalent when incompatible versions
affect the comparison. Migrations must preserve legacy meaning, label missing provenance,
and never silently reinterpret old output using current rules.

## 10. Evidence over opinion

AVA's advice must use the strongest available evidence in this order:

1. Peer-reviewed evidence relevant to the claim and population.
2. Validated biomechanics and measurement methods.
3. Curated benchmark databases with documented provenance.
4. AVA internal validation with reproducible protocols and known limitations.
5. Established expert coaching consensus.
6. Experimental hypotheses.

Evidence rank does not remove the need to assess relevance, quality, uncertainty, and
conflicts. Experimental recommendations must be clearly labeled and isolated from validated
claims. Citations, source versions, review dates, and applicability constraints must be
retained wherever evidence informs production behavior.

## 11. Human trust is more valuable than impressive numbers

AVA must never inflate speed, distance, acceleration, scores, predictions, confidence, or
recommendations to flatter an athlete, improve engagement, or support marketing. A result
that is less exciting but defensible is more valuable than one that is impressive but
fragile.

Long-term trust creates better coaching. Corrections must be transparent, versioned, and
communicated without erasing the historical record.

## 12. Every recommendation must be actionable

A production recommendation must answer all of the following:

1. What was measured?
2. Why is it important to sprint performance?
3. What observed limitation or movement pattern supports the recommendation?
4. What is the likely cause, and how certain is that inference?
5. Which muscle groups are commonly associated, without implying diagnosis?
6. What should the athlete do?
7. How should the athlete retest under comparable conditions?
8. What change is reasonable to expect, and what is the evidence for that expectation?

If AVA cannot construct this chain responsibly, it must offer a narrower observation or
withhold the recommendation. Generic advice detached from an athlete's evidence is not a
personalized recommendation.

## 13. Protect future compatibility

Every engineering decision must consider future iOS and Android clients, Motion IQ, AVA
Lift, higher-frame-rate sources, live analysis, new pose models, new research, and new
benchmarks.

This does not authorize speculative feature scope. It requires stable domain contracts,
portable provenance, durable source data, additive migrations, platform-neutral semantics,
and explicit boundaries between validated production behavior and experiments. AVA should
not create dead ends that require destroying trustworthy history or duplicating core logic
for each client.

## 14. Permit no hidden assumptions

Every threshold must be named and documented. Every benchmark must have a source. Every
confidence score must have an explanation. Every limitation must cite supporting
measurements. Units, coordinate systems, frame-rate assumptions, camera requirements,
missing-data behavior, and validity bounds must be explicit.

Magic numbers must not exist. A numeric constant that changes behavior requires an owner,
meaning, unit, rationale, validation evidence, versioning strategy, and deterministic test.
Defaults must be visible and safe; they may not silently broaden what AVA claims to know.

## 15. AVA is an engineering platform, not a social media app

AVA prioritizes:

1. Accuracy.
2. Reproducibility.
3. Validation.
4. Engineering quality.
5. Scientific integrity.

Animations, marketing, gamification, and visual polish are valuable only after the analysis
they communicate is trustworthy. Presentation may clarify evidence; it may never obscure
uncertainty or make an unsupported result appear authoritative.

The product succeeds because athletes trust the analysis.

## Engineering compliance rule

Before proposing, implementing, reviewing, or merging a feature, an AI agent or developer
must verify that it complies with every principle in this manifesto. The implementation
plan and review evidence must address, when applicable:

- measurement availability and non-fabrication;
- raw, reported, and displayed data boundaries;
- conservative reporting and mathematical consistency;
- provenance, explainability, and confidence propagation;
- diagnostic-language safeguards;
- authoritative ownership and removal of duplicate formulas;
- versioning, migration, history compatibility, and reprocessing;
- evidence quality, threshold documentation, and validation coverage;
- actionable recommendations and comparable retesting;
- cross-platform and future-model compatibility.

If any principle is violated, the implementation must be revised before it is merged. A
deadline, appealing output, model confidence, or stakeholder preference does not waive this
rule. Any intentional exception requires an explicit written engineering decision,
documented risk, named owner, expiry or review date, and proof that it cannot be mistaken
for validated production behavior.

## Stewardship

This manifesto is permanent product philosophy. Changes to it require deliberate review as
an architecture-level decision. Narrow feature work must not weaken it. Supporting policies
may become more precise as AVA's validation improves, but they must remain consistent with
the mission: produce the most trustworthy numbers, communicate uncertainty honestly, and
protect athlete trust.

Supporting production policies include the [panning-analysis foundation](./panning-analysis.md),
which applies these principles to camera motion, crop transforms, calibration, and metric
withholding.
