import { AvaPanel } from "@/components/ava/AvaPanel";
import { updateSessionCalibration } from "@/app/sessions/actions";
import { MIN_FPS, MAX_FPS } from "@/lib/video/fps";

const FIELD =
  "mt-1 rounded-lg border border-white/[0.08] bg-[#0d0d0f] px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:border-[#D72638]/50 focus:outline-none";
const FIELD_LABEL = "block text-sm font-medium text-[#A0A2A8]";

/**
 * Coach-controlled calibration inputs for a session (Day 61):
 *  - a manual FPS override, used for frame↔time conversion when the detected FPS
 *    is wrong; and
 *  - a known-distance calibration zone (e.g. a 30 m fly), giving a high-confidence
 *    scale and a direct segment velocity.
 *
 * Submits to the RLS-scoped `updateSessionCalibration` server action, which
 * validates the values before writing them. Distances here are lengths in metres;
 * the zone times are clip timestamps in seconds — never contact or flight time.
 */
export default function CalibrationControlsForm({
  sessionId,
  detectedFps,
  fpsOverride,
  zoneStartS,
  zoneEndS,
  zoneDistanceM,
}: {
  sessionId: string;
  detectedFps: number | null;
  fpsOverride: number | null;
  zoneStartS: number | null;
  zoneEndS: number | null;
  zoneDistanceM: number | null;
}) {
  return (
    <AvaPanel eyebrow="Calibration" title="Calibration Controls">
      <p className="-mt-3 mb-4 text-xs text-[#6B7280]">
        Improve timing and real-world accuracy. These override detected values and
        recompute step, calibration, and phase timing.
      </p>

      <form action={updateSessionCalibration} className="space-y-5">
        <input type="hidden" name="id" value={sessionId} />

        {/* FPS override */}
        <fieldset className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
          <legend className="px-1 text-sm font-semibold text-[#F5F5F7]">Frame rate</legend>
          <p className="mb-3 text-xs text-[#6B7280]">
            Detected FPS:{" "}
            <span className="font-medium text-[#A0A2A8]">{detectedFps ?? "unknown"}</span>. Override
            it if the video&apos;s true frame rate differs (e.g. slow-motion capture).
          </p>
          <label htmlFor="fps_override" className={FIELD_LABEL}>
            FPS override <span className="text-[#6B7280]">({MIN_FPS}–{MAX_FPS})</span>
          </label>
          <input
            id="fps_override"
            name="fps_override"
            type="number"
            inputMode="decimal"
            step="0.001"
            min={MIN_FPS}
            max={MAX_FPS}
            defaultValue={fpsOverride ?? ""}
            placeholder="e.g. 240"
            className={`${FIELD} w-40`}
          />
        </fieldset>

        {/* Calibration zone */}
        <fieldset className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
          <legend className="px-1 text-sm font-semibold text-[#F5F5F7]">
            Known-distance zone
          </legend>
          <p className="mb-3 text-xs text-[#6B7280]">
            Mark a segment of the clip with a known distance (e.g. a 30 m fly zone) to get a
            high-confidence scale and segment velocity. Set all three, or leave all blank.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="calibration_zone_start_s" className={FIELD_LABEL}>
                Zone start <span className="text-[#6B7280]">(s)</span>
              </label>
              <input
                id="calibration_zone_start_s"
                name="calibration_zone_start_s"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                defaultValue={zoneStartS ?? ""}
                placeholder="e.g. 1.50"
                className={`${FIELD} w-full`}
              />
            </div>
            <div>
              <label htmlFor="calibration_zone_end_s" className={FIELD_LABEL}>
                Zone end <span className="text-[#6B7280]">(s)</span>
              </label>
              <input
                id="calibration_zone_end_s"
                name="calibration_zone_end_s"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                defaultValue={zoneEndS ?? ""}
                placeholder="e.g. 4.80"
                className={`${FIELD} w-full`}
              />
            </div>
            <div>
              <label htmlFor="calibration_zone_distance_m" className={FIELD_LABEL}>
                Known distance <span className="text-[#6B7280]">(m)</span>
              </label>
              <input
                id="calibration_zone_distance_m"
                name="calibration_zone_distance_m"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                defaultValue={zoneDistanceM ?? ""}
                placeholder="e.g. 30"
                className={`${FIELD} w-full`}
              />
            </div>
          </div>
        </fieldset>

        <button
          type="submit"
          className="ava-red-glow rounded-lg bg-[#D72638] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#e63a4b]"
        >
          Save calibration
        </button>
      </form>
    </AvaPanel>
  );
}
