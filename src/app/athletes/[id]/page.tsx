import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import VideoUpload from "./VideoUpload";

const STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  queued: "Queued",
  analyzing: "Analyzing",
  complete: "Complete",
  failed: "Failed",
};

/**
 * Athlete detail page: shows the athlete, an upload control, and the list of
 * sprint sessions recorded for them. All reads are RLS-scoped to the signed-in
 * coach, so an athlete the coach doesn't own simply isn't found.
 */
export default async function AthletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, full_name")
    .eq("id", id)
    .single();

  if (!athlete) notFound();

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, video_path, status, created_at")
    .eq("athlete_id", athlete.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/dashboard" className="text-sm text-gray-500 hover:underline">
        ← Back to athletes
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-lane">{athlete.full_name}</h1>

      <section className="mb-8 rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Upload a sprint video</h2>
        <VideoUpload athleteId={athlete.id} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Sessions</h2>
        {sessions && sessions.length > 0 ? (
          <ul className="divide-y rounded border">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-3">
                <span className="truncate text-sm">
                  {s.video_path?.split("/").pop() ?? s.id}
                </span>
                <span className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="rounded bg-gray-100 px-2 py-0.5">
                    {STATUS_LABELS[s.status] ?? s.status}
                  </span>
                  {new Date(s.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-600">No sessions yet. Upload a video to get started.</p>
        )}
      </section>
    </main>
  );
}
