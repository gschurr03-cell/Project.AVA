# TestFlight and signing

Required manual inputs are an Apple Developer organization/team, final App ID and bundle
IDs, signing ownership, provisioning profiles, APNs capability, legal app name, version,
and build number. Use automatic signing for developer/Staging builds and an App Store
Connect profile or managed CI signing for Release. Certificates, profiles, API private
keys, and secrets are never committed.

After full Xcode is installed and configuration is supplied: build on device, run the
suite, archive the Release scheme, validate, upload through Xcode or authenticated CI,
complete export compliance, add release notes, then distribute to internal testers.
External testing additionally requires beta review metadata and review approval. No Apple
account is connected and no archive/TestFlight distribution occurred in this pass.

Prompt 13B does not change that status: no genuine archive, complete icon set, connected
team, staging mobile API, or device evidence exists. Internal builds must remain on staging
or a bounded cohort and identify capture verification, recovery and offline packages as
explicit test targets.

Prompt 13C adds the internal beta plan and exit gates, but no release status changed. The
new report experience is fixture/portable-contract validated only; it has not been
simulator, device, staging or TestFlight tested.
