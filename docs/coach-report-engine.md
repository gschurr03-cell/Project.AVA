# Coach Report Engine

The Coach Report Engine is a presentation/composition layer. Its reasoning order is:

analysis result → observations → interpretations → recommendations → priorities → report.

It never changes metric values, emits a new interpretation, selects a new intervention,
or re-ranks a priority. The composer resolves existing IDs, formats available evidence,
preserves unavailable values as null, and creates audience-appropriate summaries whose
conclusions remain identical.

Working analyses compose deterministically on demand. Saved analyses require an
immutable stored report snapshot; otherwise the report is withheld. This prevents a
historical report from changing when upstream rules change.

Current feature flags are `coachReportEngine`, `athleteReportView`, `coachReportView`,
`reportPrintExport`, `reportCompositionTrace`, and `shareableReports`. Sharing and
composition trace default off.

