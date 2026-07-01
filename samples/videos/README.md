# Local test videos

Drop a sprint test video here to run the real MediaPipe pipeline, e.g.:

```
samples/videos/test.mp4
```

Everything in this folder **except this README is git-ignored** (see
`.gitignore`) — do not commit large video files.

## Running the pipeline on a video

1. Install the Python runtime deps into a virtualenv (once):

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   python -m pip install --upgrade pip
   python -m pip install -r requirements-mediapipe.txt
   npm run mediapipe:install-check   # prints opencv + mediapipe versions
   ```

2. Run the pose extraction **with the venv active** (so the runner's `python3`
   sees mediapipe), or set `MEDIAPIPE_PYTHON` to the venv interpreter:

   ```bash
   source .venv/bin/activate
   npm run mediapipe:video -- samples/videos/test.mp4 --maxFrames 30
   # ...or without activating:
   MEDIAPIPE_PYTHON=.venv/bin/python npm run mediapipe:video -- samples/videos/test.mp4 --maxFrames 30
   ```

The validated `PoseSequence` is written to
`artifacts/pose-sequences/<video-name>.pose.json` (also git-ignored).

### Notes

- **Model download:** on first run the runner downloads the MediaPipe
  `pose_landmarker_lite.task` bundle into
  `src/lib/biomechanics/mediapipe/runtime/models/` (git-ignored) and caches it.
  Requires network access once.
- **Apple Silicon:** the runner uses the MediaPipe **Tasks** API
  (`PoseLandmarker`); recent arm64 wheels do not ship the legacy
  `mediapipe.solutions` module.
- If the Python deps or the video are missing, the runner fails cleanly with an
  actionable message and writes no artifact.
