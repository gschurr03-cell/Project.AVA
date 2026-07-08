import type { PoseSequence } from "@/lib/biomechanics/pose";

export type OverlayPoint = { x: number; y: number; visibility?: number };

export type OverlayFrame = {
  frame: number;
  time: number;
  landmarks: Record<string, OverlayPoint>;
  angles: Record<string, number | null>;
  centerOfMass: OverlayPoint | null;
  velocity: { x: number; y: number } | null;
  footContact: {
    left: boolean;
    right: boolean;
  };
  backend?: string;
  trackingConfidence?: number;
  comparisonBackend?: string;
  comparisonLandmarks?: Record<string, OverlayPoint>;
};

/**
 * Loose shape of a single raw pose frame this builder accepts. Pose artifacts
 * may arrive either as a flat MediaPipe-style `landmarks` array or the canonical
 * `keypoints` collection, optionally carrying frame index/time and foot-contact
 * events — hence every field is optional.
 */
type RawLandmark = { x: number; y: number; visibility?: number; score?: number };
type RawPoseFrame = {
  frame?: number;
  time?: number;
  landmarks?: RawLandmark[];
  keypoints?: RawLandmark[];
  events?: { leftContact?: boolean; rightContact?: boolean };
  footContact?: { left?: boolean; right?: boolean };
  backend?: string;
  trackingConfidence?: number;
  comparisonBackend?: string;
  comparisonLandmarks?: RawLandmark[];
};

const names = [
  "nose",
  "leftEyeInner",
  "leftEye",
  "leftEyeOuter",
  "rightEyeInner",
  "rightEye",
  "rightEyeOuter",
  "leftEar",
  "rightEar",
  "mouthLeft",
  "mouthRight",
  "leftShoulder",
  "rightShoulder",
  "leftElbow",
  "rightElbow",
  "leftWrist",
  "rightWrist",
  "leftPinky",
  "rightPinky",
  "leftIndex",
  "rightIndex",
  "leftThumb",
  "rightThumb",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle",
  "leftHeel",
  "rightHeel",
  "leftFootIndex",
  "rightFootIndex",
];

function angle(a?: OverlayPoint, b?: OverlayPoint, c?: OverlayPoint) {
  if (!a || !b || !c) return null;

  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };

  const dot = ab.x * cb.x + ab.y * cb.y;
  const magA = Math.hypot(ab.x, ab.y);
  const magC = Math.hypot(cb.x, cb.y);

  if (!magA || !magC) return null;

  const radians = Math.acos(Math.max(-1, Math.min(1, dot / (magA * magC))));
  return Math.round((radians * 180) / Math.PI);
}

function midpoint(a?: OverlayPoint, b?: OverlayPoint): OverlayPoint | null {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function buildOverlayFrames(sequence: PoseSequence): OverlayFrame[] {
  const frames = sequence.frames ?? [];
  const fps = sequence.fps || 30;

  return frames.map((rawFrame, index: number) => {
    const poseFrame = rawFrame as unknown as RawPoseFrame;
    const landmarksArray = poseFrame.landmarks ?? poseFrame.keypoints ?? [];
    const landmarks: Record<string, OverlayPoint> = {};
    const comparisonLandmarks: Record<string, OverlayPoint> = {};

    landmarksArray.forEach((lm: RawLandmark, i: number) => {
      const name = names[i] ?? `p${i}`;
      landmarks[name] = {
        x: lm.x,
        y: lm.y,
        visibility: lm.visibility ?? lm.score,
      };
    });
    (poseFrame.comparisonLandmarks ?? []).forEach((lm: RawLandmark, i: number) => {
      if (!lm) return;
      const name = names[i] ?? `p${i}`;
      comparisonLandmarks[name] = { x: lm.x, y: lm.y, visibility: lm.visibility ?? lm.score };
    });

    const centerOfMass =
      midpoint(landmarks.leftHip, landmarks.rightHip) ??
      midpoint(landmarks.leftShoulder, landmarks.rightShoulder);

    const prev = frames[index - 1] as unknown as RawPoseFrame | undefined;
    let velocity = null;

    if (prev?.landmarks && centerOfMass) {
      const prevLeftHip = prev.landmarks[23];
      const prevRightHip = prev.landmarks[24];

      if (prevLeftHip && prevRightHip) {
        const prevCom = midpoint(prevLeftHip, prevRightHip);
        if (prevCom) {
          velocity = {
            x: (centerOfMass.x - prevCom.x) * fps,
            y: (centerOfMass.y - prevCom.y) * fps,
          };
        }
      }
    }

    return {
      frame: poseFrame.frame ?? index,
      time: poseFrame.time ?? index / fps,
      landmarks,
      backend: poseFrame.backend ?? sequence.backend,
      trackingConfidence: poseFrame.trackingConfidence,
      comparisonBackend: poseFrame.comparisonBackend,
      comparisonLandmarks: Object.keys(comparisonLandmarks).length ? comparisonLandmarks : undefined,
      angles: {
        leftKnee: angle(landmarks.leftHip, landmarks.leftKnee, landmarks.leftAnkle),
        rightKnee: angle(landmarks.rightHip, landmarks.rightKnee, landmarks.rightAnkle),
        leftHip: angle(landmarks.leftShoulder, landmarks.leftHip, landmarks.leftKnee),
        rightHip: angle(landmarks.rightShoulder, landmarks.rightHip, landmarks.rightKnee),
        leftAnkle: angle(landmarks.leftKnee, landmarks.leftAnkle, landmarks.leftFootIndex),
        rightAnkle: angle(landmarks.rightKnee, landmarks.rightAnkle, landmarks.rightFootIndex),
        // Upper body (Day 54). Elbow = shoulder→elbow→wrist flexion; shoulder =
        // hip→shoulder→elbow, i.e. how far the upper arm has driven from the
        // trunk. Both reuse the same vertex-angle helper as the lower body.
        leftElbow: angle(landmarks.leftShoulder, landmarks.leftElbow, landmarks.leftWrist),
        rightElbow: angle(landmarks.rightShoulder, landmarks.rightElbow, landmarks.rightWrist),
        leftShoulder: angle(landmarks.leftHip, landmarks.leftShoulder, landmarks.leftElbow),
        rightShoulder: angle(landmarks.rightHip, landmarks.rightShoulder, landmarks.rightElbow),
      },
      centerOfMass,
      velocity,
      footContact: {
        left: Boolean(poseFrame.events?.leftContact ?? poseFrame.footContact?.left),
        right: Boolean(poseFrame.events?.rightContact ?? poseFrame.footContact?.right),
      },
    };
  });
}
