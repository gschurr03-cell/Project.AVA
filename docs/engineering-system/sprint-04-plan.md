# Sprint 04 — Native authentication and networking

Objective: signed native session, profile and environment flow.

Authoritative tasks: `AVA-0007`, `AVA-0008`, `AVA-0025`, `AVA-0036`.

Dependency order:

1. `AVA-0008` requires the official Apple team, bundle identity, signing assets and archive
   environment even though the tracker records no task dependency.
2. `AVA-0007` follows the deployed mobile provider (`AVA-0006`) and requires real-device
   end-to-end evidence.
3. `AVA-0025` follows `AVA-0007` and requires supported-device, VoiceOver and Dynamic Type
   evidence.
4. `AVA-0036` follows `AVA-0008` and deployed telemetry (`AVA-0010`) and requires a
   symbolicated test crash.

Sprint 03 exited PARTIAL and `AVA-0006` remains In Progress. `AVA-0010` remains Blocked.
The repository also lacks Apple team/signing authority, staging credentials and physical
device evidence. Therefore no Sprint 04 task currently satisfies Definition of Ready.
Sprint 04 may audit and regression-test existing native preparation, but must not replace
placeholder identity, perform speculative architecture changes, or claim live integration.
