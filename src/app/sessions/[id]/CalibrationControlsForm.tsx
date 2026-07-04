import { updateSessionCalibration } from "@/app/sessions/actions";
import { MIN_FPS, MAX_FPS } from "@/lib/video/fps";

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
    <section className="mt-6 rounded-lg border bg-gray-50 p-5">
      <h2 className="mb-1 text-xl font-bold text-lane">Calibration Controls</h2>
      <p className="mb-4 text-xs text-gray-500">
        Improve timing and real-world accuracy. These override detected values and
        recompute step, calibration, and phase timing.
      </p>

      <form action={updateSessionCalibration} className="space-y-5">
        <input type="hidden" name="id" value={sessionId} />

        {/* FPS override */}
        <fieldset className="rounded border bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-gray-700">Frame rate</legend>
          <p className="mb-3 text-xs text-gray-500">
            Detected FPS:{" "}
            <span className="font-medium text-gray-700">{detectedFps ?? "unknown"}</span>. Override
            it if the video&apos;s true frame rate differs (e.g. slow-motion capture).
          </p>
          <label htmlFor="fps_override" className="block text-sm font-medium text-gray-700">
            FPS override <span className="text-gray-400">({MIN_FPS}–{MAX_FPS})</span>
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
            className="mt-1 w-40 rounded border px-3 py-2"
          />
        </fieldset>

        {/* Calibration zone */}
        <fieldset className="rounded border bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-gray-700">
            Known-distance zone
          </legend>
          <p className="mb-3 text-xs text-gray-500">
            Mark a segment of the clip with a known distance (e.g. a 30 m fly zone) to get a
            high-confidence scale and segment velocity. Set all three, or leave all blank.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="calibration_zone_start_s" className="block text-sm font-medium text-gray-700">
                Zone start <span className="text-gray-400">(s)</span>
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
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="calibration_zone_end_s" className="block text-sm font-medium text-gray-700">
                Zone end <span className="text-gray-400">(s)</span>
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
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="calibration_zone_distance_m" className="block text-sm font-medium text-gray-700">
                Known distance <span className="text-gray-400">(m)</span>
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
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </div>
          </div>
        </fieldset>

        <button type="submit" className="rounded bg-lane px-4 py-2 text-white">
          Save calibration
        </button>
      </form>
    </section>
  );
}
