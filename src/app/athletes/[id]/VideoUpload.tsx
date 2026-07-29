"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  ACCEPTED_VIDEO_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  VIDEO_BIOMECHANICS_CONSENT_TYPE,
  VIDEO_BIOMECHANICS_CONSENT_VERSION,
} from "@/lib/privacy/consent";
import { preflightVideo, type VideoPreflightResult } from "@/lib/beta/videoPreflight";

type Status =
  | { state: "idle" }
  | { state: "uploading" }
  | { state: "success" }
  | { state: "error"; message: string };

/**
 * Athlete-scoped video upload. Uploads the file directly from the browser to
 * the `sprint-videos` bucket (bypassing the Next server, which caps Server
 * Action bodies at ~1MB), then records a `sessions` row pointing at it. Both
 * operations run under the anon key, so RLS authorizes them against the
 * athlete the coach owns.
 *
 * Storage path follows the existing convention: `<athlete_id>/<session_id>.<ext>`.
 */
export default function VideoUpload({ athleteId, consentAccepted }: { athleteId: string; consentAccepted:boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [consent,setConsent]=useState(consentAccepted);
  const pendingSession=useRef<string|null>(null);
  const [preflight,setPreflight]=useState<VideoPreflightResult|null>(null);

  async function inspectFile(file: File | undefined) {
    if (!file) { setPreflight(null); return; }
    const base = { fileName:file.name, fileType:file.type, fileSizeBytes:file.size };
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.preload = "metadata";
    video.src = objectUrl;
    const result = await new Promise<VideoPreflightResult>((resolve) => {
      const finish = (metadata?: {durationSeconds:number;width:number;height:number}) => {
        URL.revokeObjectURL(objectUrl);
        resolve(preflightVideo({...base,...metadata}));
      };
      video.onloadedmetadata = () => finish({
        durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      video.onerror = () => finish();
    });
    setPreflight(result);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setStatus({ state: "error", message: "Choose a video file first." });
      return;
    }
    if (!file.type.startsWith("video/")) {
      setStatus({ state: "error", message: "That file isn't a video." });
      return;
    }
    if(file.size===0){setStatus({state:"error",message:"This file is empty."});return;}
    if(file.size>MAX_UPLOAD_BYTES){setStatus({state:"error",message:"Videos must be 512 MB or smaller."});return;}
    const rawExt=file.name.includes(".")?file.name.split(".").pop()?.toLowerCase():"";
    if(!rawExt||!ACCEPTED_VIDEO_EXTENSIONS.includes(rawExt as typeof ACCEPTED_VIDEO_EXTENSIONS[number])){
      setStatus({state:"error",message:"Use an MP4, MOV, or M4V source video."});return;
    }
    if(!consent){setStatus({state:"error",message:"Accept the video and biomechanics consent before uploading."});return;}

    setStatus({ state: "uploading" });
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus({ state: "error", message: "Your session expired — please sign in again." });
      return;
    }

    const sessionId = pendingSession.current??crypto.randomUUID();
    const ext = rawExt;
    const path = `${athleteId}/${sessionId}.${ext}`;
    if(!pendingSession.current){
      const {error:consentError}=await supabase.from("user_consents").upsert({
        user_id:user.id,consent_type:VIDEO_BIOMECHANICS_CONSENT_TYPE,
        consent_version:VIDEO_BIOMECHANICS_CONSENT_VERSION,
      });
      if(consentError){setStatus({state:"error",message:"Consent could not be recorded. Try again."});return;}
      const {error:sessionError}=await supabase.from("sessions").insert({
        id:sessionId,athlete_id:athleteId,created_by:user.id,video_path:null,
        original_filename:file.name.slice(0,255),analysis_type:null,status:"uploading",
        size_bytes:file.size,
      });
      if(sessionError){setStatus({state:"error",message:sessionError.message});return;}
      pendingSession.current=sessionId;
    }

    const { error: uploadError } = await supabase.storage
      .from("sprint-videos")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setStatus({ state: "error", message: "Upload was interrupted. Check your connection and retry; the same session will be reused safely." });
      return;
    }

    const { error: updateError } = await supabase.from("sessions").update({
      video_path:path,status:"uploaded",
    }).eq("id",sessionId);
    if (updateError) {
      await supabase.storage.from("sprint-videos").remove([path]);
      setStatus({ state: "error", message: "Upload finished but the session could not be finalized. Retry safely." });
      return;
    }

    pendingSession.current=null;
    setStatus({ state: "success" });
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  const uploading = status.state === "uploading";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".mp4,.mov,.m4v,video/mp4,video/quicktime"
        disabled={uploading}
        onChange={event=>void inspectFile(event.currentTarget.files?.[0])}
        className="w-full cursor-pointer rounded-lg border border-white/[0.08] bg-[#182233] p-2 text-sm text-[#b3bccb] file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-[#2f80ed] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#3b8eff] disabled:opacity-50"
      />
      {preflight && <div role="status" className={`rounded-lg border p-3 text-xs leading-5 ${preflight.status==="unsupported"?"border-[#e46464]/40 bg-[#e46464]/10 text-[#f0a0a0]":preflight.status==="warning"?"border-[#f5c451]/30 bg-[#f5c451]/5 text-[#e8d38c]":"border-emerald-400/30 bg-emerald-400/5 text-emerald-200"}`}>
        <p className="font-semibold">{preflight.status==="unsupported"?"This video cannot be uploaded":preflight.status==="warning"?"Video preflight warning":"Basic video preflight passed"}</p>
        {[...preflight.blockingIssues,...preflight.warnings].map(item=><p key={item.code}>{item.message}</p>)}
        {preflight.durationSeconds!=null&&<p>{Math.round(preflight.durationSeconds)} seconds · {preflight.orientation}</p>}
      </div>}
      <div className="rounded-lg border border-white/[0.07] bg-black/20 p-3 text-xs leading-5 text-[#7e8797]">
        <p>MP4, MOV, or M4V · maximum 512 MB · processing supports clips up to 60 seconds. Record side-on, keep the full athlete visible, avoid zoom, and use 60 FPS or higher when possible. 30 FPS remains experimental. <a href="/help/recording" className="text-[#3b8eff] underline">Recording checklist</a></p>
        <label className="mt-2 flex items-start gap-2 text-[#C7CAD0]">
          <input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} className="mt-1 accent-[#2f80ed]"/>
          <span>I have permission to upload this video and consent to biomechanics processing. Results are performance estimates, not medical diagnosis. Experimental metrics may be withheld.</span>
        </label>
      </div>
      <div className="flex items-center gap-3" aria-live="polite" aria-busy={uploading}>
        <button
          type="submit"
          disabled={uploading}
          className="rounded-lg bg-[#2f80ed] px-4 py-2 font-semibold text-white transition hover:bg-[#3b8eff] disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload video"}
        </button>
        {status.state === "success" && (
          <span role="status" className="text-sm text-[#f5c451]">
            Upload complete.
          </span>
        )}
        {status.state === "error" && (
          <span role="alert" className="text-sm text-[#e46464]">
            {status.message}
          </span>
        )}
      </div>
    </form>
  );
}
