"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

const noteKinds = new Set<Database["public"]["Enums"]["coach_note_kind"]>(["session", "technique", "training", "competition"]);

export async function createCoachNote(formData: FormData) {
  const athleteId = String(formData.get("athlete_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as Database["public"]["Enums"]["coach_note_kind"];
  const tags = [...new Set(String(formData.get("tags") ?? "").split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  if (!athleteId || !body || body.length > 5000 || !noteKinds.has(kind)) redirect(`/athletes/${athleteId}?error=Invalid+coach+note`);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("coach_notes").insert({ athlete_id: athleteId, author_id: user.id, body, kind, tags });
  if (error) redirect(`/athletes/${athleteId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/athletes/${athleteId}`);
}

export async function toggleCoachNotePin(formData: FormData) {
  const athleteId = String(formData.get("athlete_id") ?? "");
  const noteId = String(formData.get("note_id") ?? "");
  const pinned = String(formData.get("pinned")) === "true";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("coach_notes").update({ pinned }).eq("id", noteId).eq("athlete_id", athleteId).eq("author_id", user.id);
  if (error) redirect(`/athletes/${athleteId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/athletes/${athleteId}`);
}

