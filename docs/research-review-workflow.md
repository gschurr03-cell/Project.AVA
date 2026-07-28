# Research review workflow

The ingestion lifecycle is submission, metadata extraction, duplicate detection,
license/access review, optional authorized text extraction, segmentation, candidate
extraction, metric normalization, applicability tagging, automated validation, human
review, internal approval, production approval, or archive/rejection.

Candidates cannot auto-approve. Reviewers may inspect records; senior reviewers may
approve internal use; only research administrators may approve production use.
Production approval requires an eligible reviewed evidence link to a production-approved,
non-retracted source. The status transition and reason are inserted into append-only audit
history atomically.

The current workspace is inspection-first. Metadata provider imports, licensed upload,
malware scanning, extraction editing, and approval forms remain operational follow-up
work.

