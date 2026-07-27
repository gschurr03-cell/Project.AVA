"use client";

import { useFormStatus } from "react-dom";
import { queueAnalysis } from "@/app/sessions/actions";

/**
 * Rerun submit button that disables itself while the server action is in flight, so a
 * second click cannot enqueue a duplicate rerun. `useFormStatus` reads the pending state
 * of the enclosing form's action.
 */
function Submit({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending ? "Rerunning…" : label}
    </button>
  );
}

/**
 * The Working-Analysis rerun trigger. A plain server-action form (queueAnalysis) with a
 * pending-aware button — clicking submits, requeues the working analysis, and lands back
 * on the session where the live progress card takes over. Duplicate clicks are blocked
 * while the request is actively submitting.
 */
export default function RerunAnalysisButton({
  sessionId,
  label = "Rerun Analysis",
  className = "ava-red-glow rounded-lg bg-[#D72638] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#e63a4b] disabled:cursor-not-allowed disabled:opacity-50",
}: {
  sessionId: string;
  label?: string;
  className?: string;
}) {
  return (
    <form action={queueAnalysis}>
      <input type="hidden" name="id" value={sessionId} />
      <Submit label={label} className={className} />
    </form>
  );
}
