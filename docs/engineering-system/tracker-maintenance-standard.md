# Tracker maintenance standard

`ava-tasks.json` is the canonical task dataset; CSV is an export. New work receives the next
unused task/feature/story ID. IDs are never reused, including Removed/Duplicate tasks.

Implementation sessions update status, evidence, dependencies, sprint, milestone and date.
Partial work remains In Progress. Priority changes require rationale. Removed/Duplicate
records remain for history. Source-of-truth decisions update every affected task.
Regenerate exports, run `node project-tracker/validate_tracker.mjs`, update human summaries
and recalculate percentages only from evidence.
