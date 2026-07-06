import {
  PROFILE_FIELDS,
  type AthleteProfileValues,
  type ProfileFieldDef,
} from "@/lib/athletes/profile";
import { updateAthleteProfile } from "./actions";

/**
 * Edit form for an athlete's physical & performance profile. Server-rendered and
 * posts to the `updateAthleteProfile` action; no client JS required. Field
 * metadata (labels, units, ranges, help text) comes from the shared profile
 * module so the inputs stay in lockstep with validation and the DB constraints.
 */

const GROUPS: { id: ProfileFieldDef["group"]; title: string; hint: string }[] = [
  { id: "physical", title: "Physical", hint: "Body measurements used for future calibration." },
  {
    id: "personalBest",
    title: "Personal Bests",
    hint: "Fastest recorded times, in seconds (e.g. 10.85).",
  },
  { id: "goal", title: "Goals", hint: "Target times, in seconds (e.g. 10.50)." },
];

function ProfileField({
  def,
  value,
}: {
  def: ProfileFieldDef;
  value: number | null;
}) {
  return (
    <div>
      <label htmlFor={def.key} className="block text-sm font-medium text-[#A0A2A8]">
        {def.label} <span className="text-[#6B7280]">({def.unit})</span>
      </label>
      <input
        id={def.key}
        name={def.key}
        type="number"
        inputMode="decimal"
        step={def.step}
        min={def.min}
        max={def.max}
        defaultValue={value ?? ""}
        placeholder={`${def.min}–${def.max}`}
        className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[#0d0d0f] px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:border-[#D72638]/50 focus:outline-none"
      />
      {def.help && <p className="mt-1 text-xs text-[#6B7280]">{def.help}</p>}
    </div>
  );
}

export default function AthleteProfileForm({
  athleteId,
  values,
}: {
  athleteId: string;
  values: AthleteProfileValues;
}) {
  return (
    <form action={updateAthleteProfile} className="space-y-6">
      <input type="hidden" name="id" value={athleteId} />

      {GROUPS.map((group) => {
        const fields = PROFILE_FIELDS.filter((def) => def.group === group.id);
        return (
          <fieldset key={group.id} className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
            <legend className="px-1 text-sm font-semibold text-[#F5F5F7]">{group.title}</legend>
            <p className="mb-3 text-xs text-[#6B7280]">{group.hint}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {fields.map((def) => (
                <ProfileField key={def.key} def={def} value={values[def.key]} />
              ))}
            </div>
          </fieldset>
        );
      })}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-lg bg-[#D72638] px-4 py-2 font-semibold text-white transition hover:bg-[#e63a4b]"
        >
          Save profile
        </button>
        <p className="text-xs text-[#6B7280]">
          Leave a field blank to clear it. Values are stored for reference only.
        </p>
      </div>
    </form>
  );
}
