import { updateSessionNotes } from "@/app/sessions/actions";

/**
 * Freeform coaching note for a session. Complements — never replaces — AVA's
 * generated recommendations. Submits to the `updateSessionNotes` server action,
 * which is RLS-scoped to the owning coach.
 */
export default function CoachNotesForm({
  sessionId,
  defaultNotes,
}: {
  sessionId: string;
  defaultNotes: string | null;
}) {
  return (
    <section className="mt-6 rounded border p-4">
      <h2 className="mb-1 text-lg font-semibold">Coach Notes</h2>
      <p className="mb-3 text-sm text-gray-500">
        Add your own coaching emphasis for this session.
      </p>

      <form action={updateSessionNotes} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={sessionId} />
        <textarea
          name="notes"
          defaultValue={defaultNotes ?? ""}
          rows={3}
          maxLength={1000}
          placeholder="e.g. Focus on wickets and dribbles this week. Keep volume low."
          className="w-full rounded border px-3 py-2"
        />
        <p className="text-xs text-gray-400">Max 1,000 characters.</p>
        <div>
          <button type="submit" className="rounded bg-lane px-4 py-2 text-white">
            Save notes
          </button>
        </div>
      </form>
    </section>
  );
}
