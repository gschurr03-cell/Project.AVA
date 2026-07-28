# Dependency audit

## Runtime dependencies

The web runtime is intentionally small: Next/React, Supabase SSR/client, Zod and ffprobe.
The worker also depends on ffmpeg/ffprobe, Python, OpenCV, MediaPipe and a pinned model.
Native uses Apple frameworks and a Swift package.

## Findings

- Versions are lockfile-controlled; the MediaPipe Docker model URL has a SHA-256 check.
- `npm audit --omit=dev` reports two moderate findings in Next's bundled PostCSS. The audit
  tool proposes a breaking Next 9 downgrade, which is not an acceptable remediation.
- Prior full audit found two moderate Next/PostCSS advisories without a compatible automatic
  resolution. Do not accept the invalid breaking downgrade suggested by the audit tool.
- Python dependencies use `requirements-mediapipe.txt`; reproducibility still requires
  immutable image digest and built-image execution evidence.
- RTMPose has a separate large virtual environment/model and remains experimental visual
  scope. It must stay outside production metric calculations and images.
- `next lint` is deprecated before Next 16; migrate to ESLint CLI without weakening rules.
- Local virtual environments, models and generated artifacts are large and must never enter
  build context or source control.

No dependency should be removed solely from static search; route, worker, build and native
checks must precede removal.
