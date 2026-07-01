/**
 * MediaPipe Pose backend for Project AVA.
 *
 * A concrete {@link PoseBackend} that maps MediaPipe PoseLandmarker output onto
 * AVA's canonical schema. Mapping, typing, and schema validation are real and
 * tested; actual inference is delegated to an injectable service that currently
 * stubs out (throws only when inference is attempted) until a real MediaPipe
 * runtime is wired up. Nothing here touches the video ingestion layer.
 */
export * from "./MediaPipeTypes";
export * from "./MediaPipeLandmarkMap";
export * from "./MediaPipePoseBackend";
export * from "./PythonMediaPipePoseService";
