// Phase 6.6D Part A: deterministic instrumentation-only camera-motion audit.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".p66d-camera-audit-tmp");
const liveController = process.argv.includes("--live-controller");
const evidence = path.join(root, liveController ? "tmp/phase66d-part-b" : "tmp/phase66d-part-a");
const require = createRequire(import.meta.url);
const cases = {
  ...(liveController ? { gav: "tmp/phase42k-final-gav.pose.json" } : {}),
  vanni240: "tmp/phase42k-final-vanni240.pose.json",
  vanni120: "tmp/phase42k-final-vanni120.pose.json",
  vanni60: "tmp/phase42k-final-vanni60.pose.json",
};
const names = {
  nose: "nose",
  left_shoulder: "leftShoulder",
  right_shoulder: "rightShoulder",
  left_elbow: "leftElbow",
  right_elbow: "rightElbow",
  left_wrist: "leftWrist",
  right_wrist: "rightWrist",
  left_hip: "leftHip",
  right_hip: "rightHip",
  left_knee: "leftKnee",
  right_knee: "rightKnee",
  left_ankle: "leftAnkle",
  right_ankle: "rightAnkle",
  left_heel: "leftHeel",
  right_heel: "rightHeel",
  left_toe: "leftFootIndex",
  right_toe: "rightFootIndex",
};
const percentile = (values, p) => {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))] : 0;
};
const distribution = (v) => ({
  count: v.length,
  min: v.length ? Math.min(...v) : 0,
  median: percentile(v, 0.5),
  p95: percentile(v, 0.95),
  p99: percentile(v, 0.99),
  max: v.length ? Math.max(...v) : 0,
  mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0,
});
const magnitude = (x, y) => Math.hypot(x ?? 0, y ?? 0);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
mkdirSync(evidence, { recursive: true });
const original = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return original.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        rootDir: path.join(root, "src"),
        module: "commonjs",
        target: "es2022",
        skipLibCheck: true,
        strict: true,
        moduleResolution: "node",
        baseUrl: root,
        paths: { "@/*": ["src/*"] },
      },
      files: [
        "src/lib/video/presentationCamera.ts",
        "src/lib/video/follow.ts",
        "src/lib/video/overlay.ts",
        "src/lib/biomechanics/pose.ts",
      ].map((f) => path.join(root, f)),
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], {
    cwd: root,
    stdio: "inherit",
  });
  const camera = require(path.join(out, "lib/video/presentationCamera.js"));
  const follow = require(path.join(out, "lib/video/follow.js"));
  // Frozen Phase 6.6D Part A controller snapshot. Part B intentionally changes
  // the live controller; retaining this snapshot keeps the accepted Part A
  // evidence reproducible byte-for-byte instead of silently moving its baseline.
  const legacyConfig = {
    minVisibility: 0.3,
    minLandmarks: 4,
    maxScale: 2.5,
    horizontalTimeConstantS: 0.11,
    verticalTimeConstantS: 0.65,
    zoomTimeConstantS: 0.5,
    velocityTimeConstantS: 0.16,
    anticipationS: 0.16,
    maximumLead: 0.075,
    maximumCenterVelocity: 1.8,
    maximumCenterAcceleration: 12,
    maximumScaleVelocity: 1.2,
    horizontalDeadband: 0.012,
    verticalDeadband: 0.045,
    scaleDeadband: 0.06,
    uncertaintyHoldS: 0.35,
    returnTimeConstantS: 0.65,
    horizontalPadding: 0.42,
    verticalPadding: 0.28,
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const expAlpha = (dt, tau) => 1 - Math.exp(-Math.max(0, dt) / Math.max(1e-6, tau));
  const boundedAxis = (current, currentVelocity, target, dt, tau, maxVelocity, maxAcceleration) => {
    if (dt <= 0) return { value: target, velocity: 0 };
    const desired = clamp(((target - current) * expAlpha(dt, tau)) / dt, -maxVelocity, maxVelocity);
    const velocity = clamp(
      desired,
      currentVelocity - maxAcceleration * dt,
      currentVelocity + maxAcceleration * dt,
    );
    return { value: current + velocity * dt, velocity };
  };
  const legacyStep = (previous, frame, timestampMs, options) => {
    const config = legacyConfig,
      sourceFrameIndex = frame.sourceFrameIndex ?? frame.frame;
    if (!options.enabled)
      return { ...camera.FULL_FRAME_PRESENTATION_CAMERA, timestampMs, sourceFrameIndex };
    const dt = clamp((timestampMs - previous.timestampMs) / 1000, 0, 0.25);
    const observation = camera.athletePresentationObservation(frame, legacyConfig);
    if (
      timestampMs <= previous.timestampMs &&
      !options.directSelection &&
      previous.lastSupportedTimestampMs != null
    )
      return previous;
    if (!observation) {
      const sinceSupported =
        previous.lastSupportedTimestampMs == null
          ? Infinity
          : (timestampMs - previous.lastSupportedTimestampMs) / 1000;
      if (frame.trackState !== "terminated" && sinceSupported <= config.uncertaintyHoldS) {
        const velocityX =
          previous.velocityX > 0
            ? Math.max(0, previous.velocityX - config.maximumCenterAcceleration * dt)
            : Math.min(0, previous.velocityX + config.maximumCenterAcceleration * dt);
        const velocityY =
          previous.velocityY > 0
            ? Math.max(0, previous.velocityY - config.maximumCenterAcceleration * dt)
            : Math.min(0, previous.velocityY + config.maximumCenterAcceleration * dt);
        const box = follow.clampFollow({
          cx: previous.cx + velocityX * dt,
          cy: previous.cy + velocityY * dt,
          scale: previous.scale,
        });
        return {
          ...previous,
          ...box,
          centerSourceX: box.cx,
          centerSourceY: box.cy,
          enabled: true,
          timestampMs,
          sourceFrameIndex,
          velocityX,
          velocityY,
          scaleVelocity: 0,
          presentationState: "holding",
          provenance: "held_verified",
          fallbackReason: frame.boxOrigin ?? frame.trackState ?? "pose_unavailable",
        };
      }
      const x = boundedAxis(
        previous.cx,
        previous.velocityX,
        0.5,
        dt,
        config.returnTimeConstantS,
        config.maximumCenterVelocity,
        config.maximumCenterAcceleration,
      );
      const y = boundedAxis(
        previous.cy,
        previous.velocityY,
        0.5,
        dt,
        config.returnTimeConstantS,
        config.maximumCenterVelocity / 3,
        config.maximumCenterAcceleration / 3,
      );
      const scaleDesired = clamp(
        ((1 - previous.scale) * expAlpha(dt, config.returnTimeConstantS)) / Math.max(dt, 1e-6),
        -config.maximumScaleVelocity,
        config.maximumScaleVelocity,
      );
      const box = follow.clampFollow({
        cx: x.value,
        cy: y.value,
        scale: previous.scale + scaleDesired * dt,
      });
      return {
        ...previous,
        ...box,
        enabled: true,
        centerSourceX: box.cx,
        centerSourceY: box.cy,
        targetCenterSourceX: 0.5,
        targetCenterSourceY: 0.5,
        targetScale: 1,
        velocityX: x.velocity,
        velocityY: y.velocity,
        scaleVelocity: scaleDesired,
        presentationState:
          frame.trackState === "terminated" ? "returning_to_full_frame" : "degraded",
        sourceFrameIndex,
        timestampMs,
        provenance: "full_frame",
        fallbackReason:
          frame.trackState === "terminated" ? "athlete_exited_frame" : "unsupported_localization",
        envelope: null,
      };
    }
    const rawVelocity = dt > 0 ? (observation.anchor.x - previous.targetCenterSourceX) / dt : 0;
    const estimatedVelocity =
      previous.velocityX +
      (rawVelocity - previous.velocityX) * expAlpha(dt, config.velocityTimeConstantS);
    const lead = clamp(
      estimatedVelocity * config.anticipationS,
      -config.maximumLead,
      config.maximumLead,
    );
    const targetX = observation.anchor.x + lead;
    const targetY =
      Math.abs(observation.anchor.y - previous.targetCenterSourceY) <= config.verticalDeadband
        ? previous.targetCenterSourceY
        : observation.anchor.y;
    const targetScale =
      Math.abs(observation.scale - previous.targetScale) <= config.scaleDeadband
        ? previous.targetScale
        : observation.scale;
    const reacquiring =
      previous.presentationState === "holding" ||
      previous.presentationState === "degraded" ||
      frame.boxOrigin === "reacquired";
    if (options.directSelection || previous.lastSupportedTimestampMs == null) {
      const box = follow.clampFollow({ cx: targetX, cy: targetY, scale: targetScale });
      return {
        ...previous,
        ...box,
        enabled: true,
        centerSourceX: box.cx,
        centerSourceY: box.cy,
        targetCenterSourceX: targetX,
        targetCenterSourceY: targetY,
        targetScale,
        velocityX: 0,
        velocityY: 0,
        scaleVelocity: 0,
        presentationState: reacquiring
          ? "reacquiring"
          : Math.abs(lead) > 0.002
            ? "anticipating"
            : "following",
        sourceFrameIndex,
        timestampMs,
        lastSupportedTimestampMs: timestampMs,
        provenance: observation.provenance,
        fallbackReason: null,
        envelope: observation.envelope,
      };
    }
    const xTarget =
      Math.abs(targetX - previous.cx) <= config.horizontalDeadband ? previous.cx : targetX;
    const x = boundedAxis(
      previous.cx,
      previous.velocityX,
      xTarget,
      dt,
      config.horizontalTimeConstantS,
      config.maximumCenterVelocity,
      config.maximumCenterAcceleration,
    );
    const y = boundedAxis(
      previous.cy,
      previous.velocityY,
      targetY,
      dt,
      config.verticalTimeConstantS,
      config.maximumCenterVelocity / 3,
      config.maximumCenterAcceleration / 3,
    );
    const scaleDesired = clamp(
      ((targetScale - previous.scale) * expAlpha(dt, config.zoomTimeConstantS)) /
        Math.max(dt, 1e-6),
      -config.maximumScaleVelocity,
      config.maximumScaleVelocity,
    );
    const box = follow.clampFollow({
      cx: x.value,
      cy: y.value,
      scale: previous.scale + scaleDesired * dt,
    });
    return {
      ...previous,
      ...box,
      enabled: true,
      centerSourceX: box.cx,
      centerSourceY: box.cy,
      targetCenterSourceX: targetX,
      targetCenterSourceY: targetY,
      targetScale,
      velocityX: x.velocity,
      velocityY: y.velocity,
      scaleVelocity: scaleDesired,
      presentationState: reacquiring
        ? "reacquiring"
        : Math.abs(lead) > 0.002
          ? "anticipating"
          : "following",
      sourceFrameIndex,
      timestampMs,
      lastSupportedTimestampMs: timestampMs,
      provenance: observation.provenance,
      fallbackReason: null,
      envelope: observation.envelope,
    };
  };
  const summary = {
    schema: liveController
      ? "phase-6.6d-part-b-motion-audit-v1"
      : "phase-6.6d-part-a-motion-audit-v1",
    auditDate: "2026-08-07",
    displayModel: {
      refreshHz: 60,
      clock: "requestVideoFrameCallback metadata.mediaTime",
      selection: "last pose frame at or before presented media time",
      note: "Deterministic presented-frame replay; Auto Follow ON. No browser/UI or production state mutated.",
    },
    config: liveController ? camera.DEFAULT_PRESENTATION_CAMERA_CONFIG : legacyConfig,
    benchmarks: {},
  };
  for (const [label, rel] of Object.entries(cases)) {
    const raw = JSON.parse(readFileSync(path.join(root, rel), "utf8"));
    const frames = raw.frames.map((r) => {
      const landmarks = {};
      for (const [k, v] of Object.entries(r.keypoints ?? {}))
        if (names[k]) landmarks[names[k]] = { x: v.x, y: v.y, visibility: v.visibility ?? v.score };
      return {
        frame: r.index,
        sourceFrameIndex: r.sourceFrameIndex,
        time: r.tMs / 1000,
        landmarks,
        angles: {},
        centerOfMass: null,
        velocity: null,
        footContact: { left: false, right: false },
        boxOrigin: r.boxOrigin,
        trackState: r.trackState,
      };
    });
    const livePath = liveController ? camera.buildPresentationCameraPath(frames) : null;
    let state = camera.FULL_FRAME_PRESENTATION_CAMERA,
      index = 0,
      prior = null;
    const records = [];
    const end = frames.at(-1).time;
    for (
      let displayIndex = 0, time = 0;
      time <= end + 1e-9;
      displayIndex++, time = displayIndex / 60
    ) {
      while (index + 1 < frames.length && frames[index + 1].time <= time + 1e-9) index++;
      const frame = frames[index],
        obs = camera.athletePresentationObservation(frame),
        before = state;
      state = liveController
        ? livePath[index]
        : legacyStep(state, frame, time * 1000, {
            enabled: true,
            directSelection: displayIndex === 0,
          });
      const tx = 0.5 - state.scale * state.cx,
        ty = 0.5 - state.scale * state.cy;
      const dt = prior ? time - prior.presentationTimestampS : null;
      const velocity =
        prior && dt > 0
          ? {
              x: ((tx - prior.transform.translationX) * raw.width) / dt,
              y: ((ty - prior.transform.translationY) * raw.height) / dt,
            }
          : { x: 0, y: 0 };
      const acceleration =
        prior && dt > 0
          ? {
              x: (velocity.x - prior.cameraVelocity.x) / dt,
              y: (velocity.y - prior.cameraVelocity.y) / dt,
            }
          : { x: 0, y: 0 };
      const jerk =
        prior && dt > 0
          ? {
              x: (acceleration.x - prior.cameraAcceleration.x) / dt,
              y: (acceleration.y - prior.cameraAcceleration.y) / dt,
            }
          : { x: 0, y: 0 };
      const targetJump = prior
        ? magnitude(
            (state.targetCenterSourceX - prior.cameraTarget.x) * raw.width,
            (state.targetCenterSourceY - prior.cameraTarget.y) * raw.height,
          )
        : 0;
      const jump = prior
        ? magnitude(
            (tx - prior.transform.translationX) * raw.width,
            (ty - prior.transform.translationY) * raw.height,
          )
        : 0;
      const panOnlyJump = prior
        ? magnitude(
            -prior.cameraZoom * (state.cx - prior.actualCamera.cx) * raw.width,
            -prior.cameraZoom * (state.cy - prior.actualCamera.cy) * raw.height,
          )
        : 0;
      const zoomOnlyJump = prior
        ? magnitude(
            -(state.scale - prior.cameraZoom) * state.cx * raw.width,
            -(state.scale - prior.cameraZoom) * state.cy * raw.height,
          )
        : 0;
      const sourceChanged = !prior || prior.sourceFrameIndex !== state.sourceFrameIndex;
      const record = {
        displayIndex,
        presentationTimestampS: time,
        sourceFrameIndex: state.sourceFrameIndex,
        poseTimestampS: frame.time,
        boxOrigin: frame.boxOrigin ?? null,
        trackState: frame.trackState ?? null,
        athleteWorldPosition: null,
        athleteWorldPositionReason:
          "presentation camera consumes source-normalized pose; no scientific world point enters this subsystem",
        athleteSourceAnchor: obs?.anchor ?? null,
        ...(liveController
          ? {
              rawAthleteTarget: {
                x: state.rawTargetCenterSourceX,
                y: state.rawTargetCenterSourceY,
                scale: state.rawTargetScale,
              },
            }
          : {}),
        cameraTarget: { x: state.targetCenterSourceX, y: state.targetCenterSourceY },
        actualCamera: {
          cx: state.cx,
          cy: state.cy,
          scale: state.scale,
          centerVelocityX: state.velocityX,
          centerVelocityY: state.velocityY,
          scaleVelocity: state.scaleVelocity,
          state: state.presentationState,
          provenance: state.provenance,
        },
        transform: { translationX: tx, translationY: ty, scale: state.scale },
        cameraVelocity: velocity,
        cameraAcceleration: acceleration,
        cameraJerk: jerk,
        cameraZoom: state.scale,
        cameraUpdateSource: sourceChanged
          ? "rvfc_presented_media_time_pose_frame"
          : "animation_frame_repeat_no_state_advance",
        cameraStateChanged: state !== before,
        jumpPx: jump,
        panOnlyJumpPx: panOnlyJump,
        zoomOnlyJumpPx: zoomOnlyJump,
        targetJumpPx: targetJump,
        zoomDelta: prior ? state.scale - prior.cameraZoom : 0,
        ...(liveController
          ? {
              athleteResidualSource: obs ? Math.abs(obs.anchor.x - state.cx) : null,
              athleteResidualPx: obs
                ? Math.abs(obs.anchor.x - state.cx) * raw.width * state.scale
                : null,
              containment: obs
                ? (() => {
                    const crop = camera.presentationViewport(state).crop;
                    const inside = (point) =>
                      point &&
                      point.x >= crop.x &&
                      point.x <= crop.x + crop.width &&
                      point.y >= crop.y &&
                      point.y <= crop.y + crop.height;
                    const visible = Object.values(frame.landmarks).filter(Boolean);
                    const feet = [
                      frame.landmarks.leftAnkle,
                      frame.landmarks.rightAnkle,
                      frame.landmarks.leftFootIndex,
                      frame.landmarks.rightFootIndex,
                    ].filter(Boolean);
                    return {
                      athlete: visible.every(inside),
                      head: frame.landmarks.nose ? inside(frame.landmarks.nose) : null,
                      feetContained: feet.filter(inside).length,
                      feetTotal: feet.length,
                    };
                  })()
                : null,
            }
          : {}),
      };
      records.push(record);
      prior = record;
    }
    const allMotion = records.slice(1),
      firstAcquisition = allMotion.find((r) => r.presentationTimestampS <= 0.25 && r.jumpPx > 500),
      steady = firstAcquisition
        ? allMotion.filter(
            (r) => r.presentationTimestampS > firstAcquisition.presentationTimestampS,
          )
        : allMotion,
      jumps = steady.map((r) => r.jumpPx),
      targetJumps = steady.map((r) => r.targetJumpPx),
      vel = steady.map((r) => magnitude(r.cameraVelocity.x, r.cameraVelocity.y)),
      acc = steady.map((r) => magnitude(r.cameraAcceleration.x, r.cameraAcceleration.y)),
      jerk = steady.map((r) => magnitude(r.cameraJerk.x, r.cameraJerk.y));
    const stationaryRuns = [];
    let start = null;
    for (let i = 1; i < records.length; i++) {
      if (records[i].jumpPx < 0.25) {
        if (start == null) start = i;
      } else if (start != null) {
        stationaryRuns.push(i - start);
        start = null;
      }
    }
    if (start != null) stationaryRuns.push(records.length - start);
    const top = [...steady]
      .sort((a, b) => b.jumpPx - a.jumpPx)
      .slice(0, 12)
      .map((r) => ({
        presentationTimestampS: r.presentationTimestampS,
        sourceFrameIndex: r.sourceFrameIndex,
        jumpPx: r.jumpPx,
        panOnlyJumpPx: r.panOnlyJumpPx,
        zoomOnlyJumpPx: r.zoomOnlyJumpPx,
        targetJumpPx: r.targetJumpPx,
        zoomDelta: r.zoomDelta,
        state: r.actualCamera.state,
        boxOrigin: r.boxOrigin,
        updateSource: r.cameraUpdateSource,
      }));
    summary.benchmarks[label] = {
      source: rel,
      sourceDimensions: { width: raw.width, height: raw.height },
      artifactFps: raw.fps,
      displayedFrames: records.length,
      initialAcquisition: firstAcquisition
        ? {
            presentationTimestampS: firstAcquisition.presentationTimestampS,
            jumpPx: firstAcquisition.jumpPx,
          }
        : null,
      statistics: {
        cameraJumpPx: distribution(jumps),
        panOnlyJumpPx: distribution(steady.map((r) => r.panOnlyJumpPx)),
        zoomOnlyJumpPx: distribution(steady.map((r) => r.zoomOnlyJumpPx)),
        targetJumpPx: distribution(targetJumps),
        cameraVelocityPxPerS: distribution(vel),
        cameraAccelerationPxPerS2: distribution(acc),
        cameraJerkPxPerS3: distribution(jerk),
        stationaryRunDisplayedFrames: distribution(stationaryRuns),
        transformUpdateCount: steady.filter((r) => r.jumpPx > 0.01).length,
        zeroOrSubpixelHoldCount: steady.filter((r) => r.jumpPx < 0.25).length,
        stateCounts: Object.fromEntries(
          [...new Set(records.map((r) => r.actualCamera.state))].map((s) => [
            s,
            records.filter((r) => r.actualCamera.state === s).length,
          ]),
        ),
        boxOriginCounts: Object.fromEntries(
          [...new Set(records.map((r) => r.boxOrigin ?? "null"))].map((s) => [
            s,
            records.filter((r) => (r.boxOrigin ?? "null") === s).length,
          ]),
        ),
      },
      largestSteadyStateEvents: top,
    };
    if (liveController) {
      const clean = firstAcquisition
        ? steady.filter((r) => r.displayIndex > firstAcquisition.displayIndex + 2)
        : steady.slice(2);
      const withP90 = (values) => ({ ...distribution(values), p90: percentile(values, 0.9) });
      const residualSource = clean.map((r) => r.athleteResidualSource).filter(Number.isFinite);
      const residualPx = clean.map((r) => r.athleteResidualPx).filter(Number.isFinite);
      const contained = clean.map((r) => r.containment).filter(Boolean);
      const head = contained.filter((value) => value.head != null);
      const feetTotal = contained.reduce((sum, value) => sum + value.feetTotal, 0);
      summary.benchmarks[label].partBStatistics = {
        frameToFrameTranslationPx: withP90(clean.map((r) => r.jumpPx)),
        cameraAccelerationPxPerS2: withP90(
          clean.map((r) => magnitude(r.cameraAcceleration.x, r.cameraAcceleration.y)),
        ),
        cameraJerkPxPerS3: withP90(clean.map((r) => magnitude(r.cameraJerk.x, r.cameraJerk.y))),
        holds: {
          count: stationaryRuns.length,
          longestDisplayedFrames: Math.max(0, ...stationaryRuns),
          longestSourceDurationS: Math.max(0, ...stationaryRuns) / 60,
        },
        absoluteScaleDelta: withP90(clean.map((r) => Math.abs(r.zoomDelta))),
        athleteResidualSource: withP90(residualSource),
        athleteResidualPx: withP90(residualPx),
        containment: {
          athletePercent: contained.length
            ? (contained.filter((value) => value.athlete).length / contained.length) * 100
            : 0,
          headPercent: head.length
            ? (head.filter((value) => value.head).length / head.length) * 100
            : 0,
          feetPercent: feetTotal
            ? (contained.reduce((sum, value) => sum + value.feetContained, 0) / feetTotal) * 100
            : 0,
        },
      };
    }
    writeFileSync(
      path.join(evidence, `${label}-camera-trace.json`),
      JSON.stringify(
        {
          schema: liveController
            ? "phase-6.6d-part-b-camera-trace-v1"
            : "phase-6.6d-part-a-camera-trace-v1",
          benchmark: label,
          records,
        },
        null,
        2,
      ) + "\n",
    );
  }
  writeFileSync(
    path.join(evidence, "motion-summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  Module._resolveFilename = original;
  rmSync(out, { recursive: true, force: true });
}
