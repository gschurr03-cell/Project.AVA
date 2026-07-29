import { notFound, redirect } from "next/navigation";

import { calibrationGatesSchema } from "@/lib/calibration/gates";
import { createClient } from "@/lib/supabase/server";
import { loadOverlayFrames } from "@/lib/video/loadOverlayFrames";
import TimingWorkspace from "./TimingWorkspace";

type Line = { c1: { x: number; y: number }; c2: { x: number; y: number } };

export default async function TimingWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session, error } = await supabase
    .from("sessions")
    .select("id,video_path,duration_s,fps,width,height,timing_workspace,calibration_gates,current_working_analysis_id")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") {
    console.error(`[timing workspace ${id}] session query failed:`, error);
  }
  if (!session) notFound();

  const { data: analysis } = session.current_working_analysis_id
    ? await supabase
        .from("analyses")
        .select("keypoints_path,status")
        .eq("id", session.current_working_analysis_id)
        .eq("session_id", id)
        .maybeSingle()
    : { data: null };
  const overlay = await loadOverlayFrames(supabase, analysis?.keypoints_path);
  const { data: signedVideo } = session.video_path
    ? await supabase.storage.from("sprint-videos").createSignedUrl(session.video_path, 60 * 60)
    : { data: null };

  if (!signedVideo?.signedUrl) {
    return <WorkspaceUnavailable sessionId={id} message="The original source video is unavailable." />;
  }

  const parsedGates = calibrationGatesSchema.safeParse(session.calibration_gates);
  const initialGates: { start: Line | null; finish: Line | null } = parsedGates.success
    ? {
        start: { c1: parsedGates.data.startGate.c1, c2: parsedGates.data.startGate.c2 },
        finish: { c1: parsedGates.data.finishGate.c1, c2: parsedGates.data.finishGate.c2 },
      }
    : { start: null, finish: null };
  // Per-gate canonical anchor: the source frame each stored gate line is valid in.
  // Rendering reprojects from this frame into the current view so the gate stays
  // painted on the track as the camera pans (identity when no evidence / static camera).
  const initialGateAnchorFrames = {
    start: parsedGates.success
      ? parsedGates.data.startGate.setupFrameIndex ?? parsedGates.data.startBoundary?.setupFrameIndex ?? 0
      : 0,
    finish: parsedGates.success
      ? parsedGates.data.finishGate.setupFrameIndex ?? parsedGates.data.finishBoundary?.setupFrameIndex ?? 0
      : 0,
  };
  const sourceFps = session.fps ?? overlay.meta?.fps ?? 60;
  const duration = session.duration_s
    ?? overlay.frames.at(-1)?.time
    ?? 0;
  const cameraFrames = (overlay.meta?.cameraEvidence?.transforms ?? []).map((item) => ({
    frame: item.frame,
    confidence: item.confidence,
    residualPx: item.residualPx ?? 0,
    scale: item.scale,
    rotationDeg: item.rotationDeg,
  }));

  return (
    <TimingWorkspace
      sessionId={id}
      videoUrl={signedVideo.signedUrl}
      frames={overlay.frames}
      initialWorkspace={session.timing_workspace}
      initialGates={initialGates}
      sourceFps={sourceFps}
      duration={duration}
      cameraFrames={cameraFrames}
      cameraEvidence={overlay.meta?.cameraEvidence}
      sourceWidth={session.width ?? overlay.meta?.width ?? null}
      sourceHeight={session.height ?? overlay.meta?.height ?? null}
      initialGateAnchorFrames={initialGateAnchorFrames}
      initialDistanceM={parsedGates.success ? parsedGates.data.distanceM : null}
      initialRevision={parsedGates.success ? parsedGates.data.revision ?? parsedGates.data.version ?? 0 : 0}
      cameraMode={overlay.meta?.recordingAssessment?.recordingMode ?? "evidence unavailable"}
    />
  );
}

function WorkspaceUnavailable({ sessionId, message }: { sessionId: string; message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#081019] p-8 text-[#f5f7fb]">
      <div className="max-w-md rounded-xl border border-white/10 bg-[#081019] p-6">
        <p className="text-lg font-semibold">Timing Workspace unavailable</p>
        <p className="mt-2 text-sm text-[#7e8797]">{message}</p>
        <a className="mt-5 inline-block text-sm text-[#D94A58]" href={`/sessions/${sessionId}`}>Return to session</a>
      </div>
    </main>
  );
}
