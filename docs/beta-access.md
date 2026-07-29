# Beta access

The web application currently uses authenticated self-registration. Environment validation
supports an allowlist flag and requires it for `closed_beta`, but invitation creation and
acceptance are not implemented in this web layer. A closed-beta deployment must enforce the
approved cohort through the configured authentication provider or an audited allowlist before
inviting users.

Roles are `coach`, `athlete`, and `admin`. The beta operations route is admin-only. Migration
`0056` removes owner ability to update the `profiles.role` column. No component-level email
allowlist or scattered email-based administrator check is used.

