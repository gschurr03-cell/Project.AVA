# Support operations

Authenticated requests are stored in `support_requests`. Categories cover authentication,
profile, upload, calibration, analysis failure, result questions, reports, privacy, deletion,
manual data export, and other issues. Users receive an `AVA-SUP-*` reference.

Safe context contains release, environment, route, and timestamp. Do not request or store
passwords, tokens, auth links, signed URLs, raw video URLs, private notes, or stack traces.
Linked session/analysis ownership is enforced by RLS. Users are limited to three requests per
hour; feedback is limited to five submissions per hour.

Email delivery is not configured. Operators must monitor the database queue and use the beta
contact method provided outside the application. Status changes are restricted to admins.

