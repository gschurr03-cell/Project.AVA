import { createCoachNote, toggleCoachNotePin } from "./noteActions";
import type { Database } from "@/lib/supabase/database.types";

type Note = Database["public"]["Tables"]["coach_notes"]["Row"];
const kinds: Array<Database["public"]["Enums"]["coach_note_kind"]> = ["session", "technique", "training", "competition"];

export default function CoachNotesPanel({ athleteId, notes }: { athleteId: string; notes: Note[] }) {
  return (
    <section className="mb-8 rounded-2xl border border-white/[0.06] bg-[#101827]/95 p-5">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#2f80ed]">Coach Notes</p><h2 className="mt-1 text-lg font-semibold text-[#f5f7fb]">Structured coaching history</h2></div>
      <form action={createCoachNote} className="mt-4 grid gap-2 sm:grid-cols-[140px_1fr_auto]">
        <input type="hidden" name="athlete_id" value={athleteId} />
        <select name="kind" className="rounded-lg border border-white/10 bg-[#182233] px-3 py-2 text-sm">{kinds.map((kind) => <option key={kind} value={kind}>{kind[0].toUpperCase() + kind.slice(1)}</option>)}</select>
        <input name="body" required maxLength={5000} placeholder="Observation, context, or follow-up…" className="rounded-lg border border-white/10 bg-[#182233] px-3 py-2 text-sm" />
        <button className="rounded-lg bg-[#2f80ed] px-4 py-2 text-sm font-semibold">Save note</button>
        <input name="tags" placeholder="Tags, comma separated" className="rounded-lg border border-white/10 bg-[#182233] px-3 py-2 text-sm sm:col-start-2" />
      </form>
      <div className="mt-4 space-y-2">
        {notes.length ? notes.map((note) => (
          <article key={note.id} className={`rounded-xl border p-3 ${note.pinned ? "border-amber-400/25 bg-amber-400/[0.04]" : "border-white/[0.06] bg-white/[0.02]"}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#b3bccb]">{note.pinned ? "★ " : ""}{note.kind} note</p>
              <form action={toggleCoachNotePin}><input type="hidden" name="note_id" value={note.id}/><input type="hidden" name="athlete_id" value={athleteId}/><input type="hidden" name="pinned" value={String(!note.pinned)}/><button className="text-xs text-[#b3bccb]">{note.pinned ? "Unpin" : "Pin"}</button></form>
            </div>
            <p className="mt-2 text-sm text-[#f5f7fb]">{note.body}</p>
            {note.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{note.tags.map((tag) => <span key={tag} className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-[#b3bccb]">#{tag}</span>)}</div>}
            <p className="mt-2 text-[10px] text-[#7e8797]">Created {new Date(note.created_at).toLocaleString()}{note.updated_at !== note.created_at ? ` · edited ${new Date(note.updated_at).toLocaleString()}` : ""}</p>
          </article>
        )) : <p className="text-sm text-[#7e8797]">No coach notes yet.</p>}
      </div>
    </section>
  );
}

