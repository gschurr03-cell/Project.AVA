# Dead-letter and intervention

Terminal records preserve classification, failed stage, attempts/timestamps, versions,
dependency states, staged-snapshot presence, replay eligibility/reason and recommended
action. Review states are unreviewed, acknowledged and reviewed.

Operations may acknowledge, review, attach a bounded 500-character internal note, cancel
remaining work or launch an independently authorized replay. They cannot edit outputs or
activate incomplete snapshots. Tables are client-write-inaccessible and operations must
be service-side and audited before UI controls are added.

