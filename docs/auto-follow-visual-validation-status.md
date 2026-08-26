# Auto Follow visual validation status

## Classification: REVIEW

Auto Follow remains frozen: no implementation change was made during this
validation batch. The available real-decoded browser captures support visual
alignment and framing on the stable/reference paths, but the required
intentional-pan visual case cannot be completed from the workspace because its
protected source video is not present as a browser-decodable fixture.

## Evidence collected

| Required case | Evidence | Result |
| --- | --- | --- |
| Relatively stable clip | GAV reference session, real-decoded H.264 replacement; 1.0 s Auto Follow + Stabilized View playback | PASS for comfortable framing and shared overlay alignment. |
| Available moving benchmark | Vanni 240 and Vanni 60 real-decoded browser playback, pause/resume, scrub, resize, fullscreen | PASS for decoded playback, retained alignment, and no browser console errors. Not classified as a dedicated handheld/shake acceptance source. |
| Intentional pan | `real-side-pan-fly-001` fixture identifies protected session `2f1c901b-a5e2-4682-9049-1aa1fe8e89fb`, but its HEVC source is explicitly not committed and no H.264 browser validation copy exists | NOT RUN. |

The inspected GAV capture shows the athlete comfortably in frame with the
skeleton and event/step overlays registered to the video. The Vanni captures
show the same shared-wrapper alignment. The real browser run decoded 1920×1080
media, exercised playback, pause/resume, forward/back scrub, resize, and
fullscreen, and recorded zero console errors.

Artifacts:

- `tmp/step9-autofollow-visual/gav-step9-live1.png`
- `tmp/step9-autofollow-visual/gav-step9-live1.json`
- `tmp/phase94/browser/vanni240-player-closeup.png`
- `tmp/phase94/browser/vanni60-player-closeup.png`
- `tmp/phase94/browser-validation.json`

## Conclusion

The browser evidence found no visible alignment or framing defect in the
available decoded clips. It is insufficient to certify the requested
handheld/shake and intentional-pan temporal behavior, so this is **REVIEW**,
not FAIL. There is no evidence that warrants reopening transform architecture
or changing Auto Follow.

## To close Auto Follow for V1

Provide a browser-decodable copy of the protected `real-side-pan-fly-001`
source (or authorize an equivalent panning session) and one confirmed
handheld/shaky clip. Run them through the existing authenticated browser
capture with Auto Follow and Stabilized View enabled, inspect continuous
playback for secondary pan/zoom or snap, then classify PASS only if those two
cases are clean.
