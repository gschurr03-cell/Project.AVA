# AVA Coach Workspace

## Root architecture

```text
Organization
  └─ memberships (owner, head coach, assistant coach, read-only staff)
       └─ teams
            ├─ assigned coaches
            └─ athletes
                 ├─ sessions → analyses
                 ├─ canonical Progress Center report
                 ├─ structured coach notes + revision history
                 └─ coach preferences (favorite / recently viewed)
                      ↓
                  Coach Workspace
                    ├─ roster
                    ├─ team analytics
                    ├─ attention queue
                    ├─ comparisons
                    └─ workflow shortcuts
```

Existing `athletes.coach_id` ownership remains active. A coach with no organization or team sees the same athletes as before, making team architecture additive rather than a migration requirement.

## Data-model audit

| Domain | Existing support | Coach Workspace addition |
|---|---|---|
| Users | `profiles`, authenticated ownership | Organization membership and roles |
| Athletes | Coach-owned profile, PBs, body fields | Photo URL, event, age group, optional teams |
| Sessions/uploads | Athlete-linked recordings and lifecycle | Team-level roster and recent-session aggregation |
| Analyses | Session-linked immutable outputs and versions | Canonical historical report per athlete |
| Sprint Intelligence | Deterministic session derivation | Latest limiter and attention aggregation |
| Historical metrics | Progress Center aggregation | Cross-athlete roster and team analytics |
| Collaboration | Pure TypeScript note/RBAC prototypes | RLS-backed structured notes and edit history |

## Database changes

Migration `0054_coach_workspace.sql` adds:

- `organizations`
- `organization_memberships`
- `teams`
- `team_coaches`
- `team_athletes`
- `coach_notes`
- `coach_note_revisions`
- `coach_athlete_preferences`
- athlete photo/event/age-group metadata
- organization and note enums
- tenant-aware helper functions, indexes, triggers, and RLS policies

The note-update trigger stores the previous body, tags, pin state, editor, and edit timestamp before every update. Read-only staff can view assigned data but cannot create or edit notes.

## Permission model

- Legacy owning coaches retain access through `athletes.coach_id`.
- Owners/head coaches can reach all active team athletes in their organization.
- Assistant coaches require explicit team assignment.
- Read-only staff can view organization teams but cannot mutate coach notes.
- All team access requires both organization membership and an active team-athlete link.
- Analyses remain read-only to end users.
- Cross-organization access has no path without matching membership/team relationships.

## Roster and analytics

The workspace reads each athlete's canonical Progress Center report. It never recalculates biomechanics.

Roster status is deterministic:

- `needs_attention`: latest recording quality below 60 or at least two declining metrics.
- `watch`: one declining metric or a high-priority supported limiter.
- `on_track`: improving or no supported alert.
- `no_data`: no readable completed analysis.

Team analytics include latest average peak velocity/contact time, most common limiter, recording quality, improvement rate, most improved athlete, attention list, and recent analysis PBs. Injury inference is explicitly absent; the UI shows a future placeholder only.

## Notes

Notes are typed as session, technique, training, or competition. They support tags, pinning, session association, timestamps, edit history, and future multi-author collaboration. UI writes use authenticated server actions; RLS remains the final authority.

## Comparisons

Athlete comparison uses latest canonical historical points. It reports shared metrics, confidence difference, and limiter difference deterministically. Athlete-vs-PB and previous-session comparisons remain available in the athlete Progress Center; team average and team trend use the same roster inputs.

## Scale and performance

The initial workspace uses three RLS-scoped bulk reads—athletes, sessions, analyses—plus one preferences read. There is no per-athlete query waterfall and no frame or media loading. Aggregation is linear in athletes, analyses, and metric families. Future club-scale pagination or a server-side materialized read model can feed the same contracts without changing analysis storage.

## Future extension points

- Invitation and membership administration UI
- Organization/team creation settings
- Persistent notification acknowledgements
- Staff-specific scopes beyond team assignment
- Media thumbnails and controlled photo uploads
- Team reports and export jobs
- Injury data only through explicit external medical/workflow input, never inference

