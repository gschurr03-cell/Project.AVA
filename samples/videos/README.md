# Local test videos

Drop a sprint test video here to run the real MediaPipe pipeline, e.g.:

```
samples/videos/test.mp4
```

Everything in this folder **except this README is git-ignored** (see
`.gitignore`) — do not commit large video files.

## Running the pipeline on a video

1. Install the Python runtime deps (once):

   ```bash
   pip install -r requirements-mediapipe.txt
   npm run mediapipe:install-check   # prints opencv + mediapipe versions
   ```

2. Run the pose extraction:

   ```bash
   npm run mediapipe:video -- samples/videos/test.mp4 --maxFrames 30
   ```

The validated `PoseSequence` is written to
`artifacts/pose-sequences/<video-name>.pose.json` (also git-ignored).

If the Python deps or the video are missing, the runner fails cleanly with an
actionable message and writes no artifact.
