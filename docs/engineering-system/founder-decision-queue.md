# Founder decision queue

| Decision | Question | Recommendation | Blocked tasks | Deadline | Status |
| - | - | - | - | - | - |
| DEC-001 | Which provider/account will host isolated staging? | Use a separate Supabase project plus existing web/worker architecture. | AVA-0002, AVA-0004, AVA-0009, AVA-0010, AVA-0011 | M1 | Open |
| DEC-002 | Which activated record is canonical across web and native? | Versioned immutable activated result; legacy reads remain until equivalence. | AVA-0017, AVA-0018 | M2 | Recommended |
| DEC-003 | Which metrics are permitted in coach and athlete beta? | Only registry-supported metrics; keep peak velocity/contact time hidden. | AVA-0015, AVA-0016, AVA-0049 | M3 | Open |
| DEC-004 | Does training ship in the first coach beta? | No; enable only after persistence, approval and safety events. | AVA-0020, AVA-0021, AVA-0022, AVA-0023 | M4 | Open |
| DEC-005 | What are retention and deletion defaults? | Shortest viable retention with explicit backup limitations. | AVA-0012, AVA-0027, AVA-0037 | M1 | Open |
| DEC-006 | Are minors excluded from initial beta? | Exclude until consent, safeguarding and legal review exist. | AVA-0037 | M6 | Open |
