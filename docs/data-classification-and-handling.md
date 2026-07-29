# Data classification and handling

Public: marketing/legal copy. Internal: aggregate operational metrics and rule identifiers.
Confidential: account/coach configuration. Sensitive athlete data: profile, competition,
training, analysis and biomechanics. Restricted health-related: pain and clinician
restrictions. Security-sensitive: secrets, tokens, signed URLs, audit/admin data.

Athlete/restricted data belongs only in private scoped database/storage and encrypted device
storage; never in metric labels, notifications, standard logs, public URLs, or shared
dashboards. Exports require authorization/redaction. Retention/deletion are provider and
policy decisions still requiring approval.

