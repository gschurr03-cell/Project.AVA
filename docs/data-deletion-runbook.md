# Data deletion runbook

The application records account deletion requests and supports scoped session/video
deletion. End-to-end deletion is not production complete.

Required worker workflow: authenticate request; freeze new processing; revoke sessions and
packages; enumerate athletes, videos, pose artifacts, reports, snapshots, caches and pending
jobs; delete/anonymize in dependency order; reconcile storage; suppress analytics; preserve
only legally approved audit records; record completion. Disclose backup retention. Test on
staging before beta. Never claim completion from the request row alone.

