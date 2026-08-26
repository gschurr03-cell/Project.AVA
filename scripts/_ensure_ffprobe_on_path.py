"""Phase R3C — forensic-tooling safety helper.

ROOT CAUSE THIS FIXES (docs/phase-r3c-source-frame-timestamp-correspondence.md):
`mediapipe_pose_runner.py`'s `probe_rotation_degrees()` shells out to a bare
`ffprobe` command and silently returns `None` (treated as "no rotation
needed") if that subprocess call fails for ANY reason, including
`FileNotFoundError` when `ffprobe` is not on `$PATH` — which it is NOT by
default in a bare `python3 script.py` shell in this repo (only the
project's own `node_modules/@ffprobe-installer/*` bundled binary exists;
there is no system-wide install). This silently broke EVERY forensic
diagnostic script in R3B-4/R3B-5 that replayed real production functions
against the real Vanni 60 source video: the file actually carries a real
`rotate=180` tag, so every frame those scripts decoded was analyzed
**unrotated** — 180° off from the correct orientation the real production
worker (whose invoking environment DOES have `ffprobe` on `PATH`) uses.
This produced a cascade of wrong conclusions about candidate positions,
directions, and even what the video's content looked like.

**Import this module (for its side effect) before importing
`mediapipe_pose_runner` in any forensic/diagnostic script that touches
video decoding or calls `probe_rotation_degrees`/`tiled_locate`/anything
that shells out to ffprobe.** It prepends this repo's own bundled ffprobe/
ffmpeg binaries to `os.environ["PATH"]` for the current process, so the
bare `ffprobe`/`ffmpeg` subprocess calls inside `mediapipe_pose_runner.py`
resolve correctly — matching the real worker's own invoking environment
instead of a bare local shell.

    import _ensure_ffprobe_on_path  # noqa: F401 -- side effect only, must run BEFORE `import mediapipe_pose_runner`

DO NOT remove this import from a forensic script and DO NOT assume
`probe_rotation_degrees()` returning `None` means "no rotation" without
first confirming `ffprobe` is actually reachable — the function cannot
distinguish "genuinely no rotation" from "ffprobe was unreachable" and
never raises, by design (see its own docstring for why: a previous, related
bug already made this whole probe fail-closed once before).
"""
import os

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_BUNDLED_FFPROBE_DIR = os.path.join(_ROOT, "node_modules", "@ffprobe-installer", "darwin-arm64")
_BUNDLED_FFMPEG_DIR = os.path.join(_ROOT, "node_modules", "ffmpeg-static")

for _dir in (_BUNDLED_FFPROBE_DIR, _BUNDLED_FFMPEG_DIR):
    if os.path.isdir(_dir) and _dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = _dir + os.pathsep + os.environ.get("PATH", "")


def ffprobe_is_reachable():
    """Explicit, fail-LOUD verification for scripts that want to assert this
    rather than silently trust probe_rotation_degrees()'s own fail-closed
    behavior. Returns True/False; never raises."""
    import shutil
    return shutil.which("ffprobe") is not None
