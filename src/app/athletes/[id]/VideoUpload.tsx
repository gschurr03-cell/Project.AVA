"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

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
export default function VideoUpload({ athleteId }: { athleteId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ state: "idle" });

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

    setStatus({ state: "uploading" });
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus({ state: "error", message: "Your session expired — please sign in again." });
      return;
    }

    const sessionId = crypto.randomUUID();
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "mp4";
    const path = `${athleteId}/${sessionId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("sprint-videos")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setStatus({ state: "error", message: uploadError.message });
      return;
    }

    const { error: insertError } = await supabase.from("sessions").insert({
      id: sessionId,
      athlete_id: athleteId,
      created_by: user.id,
      video_path: path,
      status: "uploaded",
    });

    if (insertError) {
      // Storage object is now orphaned; surfaced as an error for the MVP.
      setStatus({ state: "error", message: insertError.message });
      return;
    }

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
        accept="video/*"
        disabled={uploading}
        className="text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={uploading}
          className="rounded bg-lane px-4 py-2 text-white disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload video"}
        </button>
        {status.state === "success" && (
          <span role="status" className="text-sm text-green-700">
            Upload complete.
          </span>
        )}
        {status.state === "error" && (
          <span role="alert" className="text-sm text-red-700">
            {status.message}
          </span>
        )}
      </div>
    </form>
  );
}
