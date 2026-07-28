"use client";

import { useMemo, useState } from "react";
import { updateTimingSetup } from "@/app/sessions/actions";
import { timingSetupSchema, type TimingSetupMode } from "@/lib/calibration/timingSetup";

const FIELD = "mt-1 w-full rounded-lg border border-white/[0.08] bg-[#081019] px-3 py-2 text-sm text-[#f5f7fb] focus:border-[#2f80ed]/50 focus:outline-none";
const LABEL = "block text-xs font-medium text-[#b3bccb]";
const modes: Array<{ value: TimingSetupMode; title: string; description: string }> = [
  { value: "marked_zone", title: "Marked zone", description: "Use visible tape or track lines at the start and finish. Recommended for automatic timing." },
  { value: "fixed_landmarks", title: "Fixed landmarks", description: "Use permanent visible references that identify the measured start and finish planes." },
  { value: "manual_crossing", title: "Manual crossing", description: "Select the start and finish crossings frame by frame. Experimental." },
  { value: "technique_only", title: "Technique only", description: "Analyze sprint mechanics without zone timing." },
];

function DistanceFields() {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/[0.06] bg-black/15 p-3 sm:grid-cols-2">
      <label className={LABEL}>Distance (m)<input className={FIELD} name="setup_distance_m" type="number" min="0" step="0.01" /></label>
      <label className={LABEL}>Distance status
        <select className={FIELD} name="distance_status" defaultValue="user_asserted">
          <option value="surveyed">Surveyed</option><option value="verified_track_marking">Verified track marking</option>
          <option value="hardware_defined">Hardware defined</option><option value="user_measured">User measured</option>
          <option value="user_asserted">User asserted</option><option value="unknown">Unknown</option>
        </select>
      </label>
      <label className={LABEL}>Measurement method<input className={FIELD} name="distance_method" placeholder="Tape measure, track marks…" /></label>
      <label className={LABEL}>Uncertainty (m)<input className={FIELD} name="distance_uncertainty_m" type="number" min="0" step="0.01" /></label>
      <label className={`${LABEL} sm:col-span-2`}>Distance evidence<input className={FIELD} name="distance_evidence" placeholder="How was this distance established?" /></label>
    </div>
  );
}

function PointFields({ prefix, title }: { prefix: "start" | "finish"; title: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
      <p className="text-sm font-semibold text-[#f5f7fb]">{title}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["c1x", "c1y", "c2x", "c2y"] as const).map((field) => (
          <label key={field} className={LABEL}>{field.toUpperCase()}
            <input className={FIELD} name={`${prefix}_${field}`} type="number" min="0" max="1" step="0.0001" />
          </label>
        ))}
      </div>
      <label className={`${LABEL} mt-2`}>Physical evidence<input className={FIELD} name={`${prefix}_physical_evidence`} placeholder="Fixed seam, tripod pair, surveyed posts…" /></label>
      <label className="mt-3 flex items-center gap-2 text-xs text-[#b3bccb]"><input type="checkbox" name={`${prefix}_confirmed`} /> I confirm these points define the physical crossing plane.</label>
      <input type="hidden" name={`${prefix}_reference_type`} value="two_fixed_points" />
    </div>
  );
}

function BracketFields({ prefix, title }: { prefix: "start" | "finish"; title: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
      <p className="text-sm font-semibold text-[#f5f7fb]">{title}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className={LABEL}>Frame before<input className={FIELD} name={`${prefix}_before_frame`} type="number" min="0" step="1" /></label>
        <label className={LABEL}>Time before (s)<input className={FIELD} name={`${prefix}_before_time_s`} type="number" min="0" step="0.000001" /></label>
        <label className={LABEL}>Frame after<input className={FIELD} name={`${prefix}_after_frame`} type="number" min="0" step="1" /></label>
        <label className={LABEL}>Time after (s)<input className={FIELD} name={`${prefix}_after_time_s`} type="number" min="0" step="0.000001" /></label>
      </div>
      <label className={`${LABEL} mt-2`}>Crossing position between frames (0–1)<input className={FIELD} name={`${prefix}_interpolation`} type="number" min="0" max="1" step="0.01" placeholder="Leave blank for conservative frame boundary" /></label>
    </div>
  );
}

export default function TimingSetupForm({ sessionId, setup }: { sessionId: string; setup: unknown }) {
  const parsed = useMemo(() => timingSetupSchema.safeParse(setup), [setup]);
  const [mode, setMode] = useState<TimingSetupMode>(parsed.success ? parsed.data.setupMode : "technique_only");
  return (
    <form action={updateTimingSetup} className="space-y-4 rounded-xl border border-white/[0.06] bg-[#182233] p-4">
      <input type="hidden" name="id" value={sessionId} />
      <h3 className="text-sm font-semibold text-[#f5f7fb]">How are the timing boundaries defined?</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {modes.map((item) => (
          <label key={item.value} className={`cursor-pointer rounded-xl border p-3 ${mode === item.value ? "border-[#2f80ed]/60 bg-[#2f80ed]/10" : "border-white/[0.07] bg-black/10"}`}>
            <span className="flex items-center gap-2 text-sm font-semibold text-[#f5f7fb]">
              <input type="radio" name="timing_setup_mode" value={item.value} checked={mode === item.value} onChange={() => setMode(item.value)} />{item.title}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-[#8C8E94]">{item.description}</span>
          </label>
        ))}
      </div>

      {mode !== "technique_only" && <DistanceFields />}
      {mode === "marked_zone" && (
        <div className="space-y-3 text-xs text-[#b3bccb]">
          <p>Place bright tape across the lane at both boundaries, or use clearly visible fixed track markings. Use the video gate editor to select each line; AVA will require local-lock confirmation before timing.</p>
          <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">AVA found this physical line. Confirm or adjust. Weak or untracked selections remain unavailable.</p>
          <label className="flex gap-2"><input type="checkbox" name="start_confirmed" /> Confirm start selection</label>
          <label className="flex gap-2"><input type="checkbox" name="finish_confirmed" /> Confirm finish selection</label>
        </div>
      )}
      {mode === "fixed_landmarks" && (
        <div className="space-y-3">
          <label className={LABEL}>Lane identity<input className={FIELD} name="lane_identity" placeholder="e.g. lane 4" /></label>
          <p className="text-xs text-[#8C8E94]">Select two fixed points across the lane. A single cone cannot define a plane.</p>
          <PointFields prefix="start" title="Start landmark plane" /><PointFields prefix="finish" title="Finish landmark plane" />
        </div>
      )}
      {mode === "manual_crossing" && (
        <div className="space-y-3">
          <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-[#D6C48A]">Experimental manual video timing. The start and finish crossings are selected manually because no trackable physical boundary is available.</p>
          <BracketFields prefix="start" title="Start crossing" /><BracketFields prefix="finish" title="Finish crossing" />
          <label className={LABEL}>Manual notes<textarea className={FIELD} name="manual_notes" rows={2} /></label>
        </div>
      )}
      {mode === "technique_only" && <p className="text-xs text-[#b3bccb]">Timing markers are not required for mechanics analysis. No failed-timing error or zone result will be generated.</p>}

      <button className="ava-red-glow rounded-lg bg-[#2f80ed] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3b8eff]" type="submit">
        Save setup &amp; create new analysis version
      </button>
    </form>
  );
}
