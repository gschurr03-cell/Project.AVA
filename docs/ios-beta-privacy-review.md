# iOS beta privacy review

The package is account/athlete/analysis/manifest scoped and accepts only authoritative
activated data. Mobile models omit internal traces, tokens, raw API bodies and video.
Evidence links require HTTPS. Telemetry contains event/context/correlation metadata, never
report text, names or raw metrics. Feedback text is bounded and screenshots require consent.

Coach-only portfolio fields are not implemented. Role is explicit, but live server
authorization remains mandatory before exposing coach detail. Sharing is default-off.
Diagnostics/export UI must remain allow-listed and user reviewed. No production privacy
approval or App Store screenshot review has occurred.

