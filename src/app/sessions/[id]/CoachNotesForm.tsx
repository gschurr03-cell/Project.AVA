import { AvaPanel } from "@/components/ava/AvaPanel";
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
    <AvaPanel eyebrow="Coach Notes" title="Session Emphasis">
      <p className="-mt-3 mb-3 text-sm text-[#6B7280]">
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
          className="w-full rounded-lg border border-white/[0.08] bg-[#0d0d0f] px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:border-[#D72638]/50 focus:outline-none"
        />
        <p className="text-xs text-[#6B7280]">Max 1,000 characters.</p>
        <div>
          <button
            type="submit"
            className="rounded-lg border border-white/[0.12] bg-white/[0.05] px-4 py-2 text-sm font-medium text-[#F5F5F7] transition hover:bg-white/[0.09]"
          >
            Save notes
          </button>
        </div>
      </form>
    </AvaPanel>
  );
}
