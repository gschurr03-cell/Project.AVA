# AVA project tracker

Canonical machine files:

- `ava-tasks.json` and CSV export
- epic, feature, story, sprint, milestone, dependency, risk and decision JSON

Validate with:

```sh
node project-tracker/validate_tracker.mjs
```

`build_tracker.mjs` deterministically rebuilds the initial normalized dataset and generated
registers from the audited 50-item backlog. Do not run it after live task edits without
first incorporating those edits into its source mapping, because it is a baseline generator,
not an append-only project-management database.

Human navigation begins at
`docs/engineering-system/ava-engineering-master-tracker.md`.
