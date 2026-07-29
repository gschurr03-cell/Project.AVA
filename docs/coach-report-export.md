# Coach Report export

The MVP export is the browser print dialog from the authenticated report route. Print CSS
removes navigation and controls, uses a white document surface, preserves readable
contrast, and avoids splitting report sections where the browser supports it. Users may
choose “Save as PDF.”

No server PDF is generated and no public object is stored. Shareable reports are disabled
because AVA has no report-token model, revocation policy, expiry policy, access audit, or
immutable report snapshot persistence yet.

