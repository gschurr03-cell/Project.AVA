# Removal and consolidation backlog

| ID | Candidate | Proof required | Risk/checks | Rollback |
| --- | --- | --- | --- | --- |
| REM-01 | Mock default in generic `processVideo` production reachability | import/call graph + production bundle | pose/sanity/worker gates | explicit dev adapter |
| REM-02 | Legacy result callback after RPC cutover | traffic/log evidence | worker completion E2E | retain versioned endpoint |
| REM-03 | Legacy coaching thresholds | manifest equivalence | report snapshots | feature rollback |
| REM-04 | Direct engine reads after manifest cutover | read telemetry | all engine contract tests | read-mode flag |
| REM-05 | Experimental 30 FPS production UI | route/flag audit | research fixtures | internal-only route |
| REM-06 | RTMPose production image/dependencies | build/runtime graph | visual comparison tests | separate research image |
| REM-07 | Redundant sanity aliases | command-to-file map | CI evidence categories | retain canonical command |
| REM-08 | Stale architecture docs | supersession links | doc link check | git history |
| REM-09 | Generated/local artifacts in repo surface | ignore/status audit | build/test clean checkout | regenerate |
| REM-10 | Unused developer panels | route analytics/import search | internal workflow confirmation | feature branch/tag |

Nothing is approved for removal based only on this audit.
