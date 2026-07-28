import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Focused browser acceptance for Manual Timing-Zone Authority (Part 1). Proves the
 * confirmed zone does NOT drift through refresh, resize, and navigation, using the
 * server-rendered `data-testid=calibration-hooks` canonical values (byte-identical
 * assertions — not screenshots). Uses the real founder-owned session with a real
 * video + a manual_confirmed zone; nothing is mutated.
 *
 * The founder password is read from the seed source at runtime so it never appears
 * in this spec or in logs.
 */
const SESSION_ID = "76efcf70-9602-4a7a-be1f-ba5814c3c700";
const FOUNDER_EMAIL = "commander@atreides.local";

function founderPassword(): string {
  const seed = readFileSync(path.join(process.cwd(), "scripts/dev-seed.mjs"), "utf8");
  const m = seed.match(/email:\s*"commander@atreides\.local"[\s\S]*?password:\s*"([^"]+)"/);
  if (!m) throw new Error("founder password not found in seed source");
  return m[1];
}

async function signInFounder(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Email", { exact: true }).fill(FOUNDER_EMAIL);
  await page.getByPlaceholder("Password", { exact: true }).fill(founderPassword());
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

type Hooks = Record<string, string | null>;
async function readHooks(page: Page): Promise<Hooks> {
  const el = page.getByTestId("calibration-hooks");
  await expect(el).toBeAttached();
  const keys = [
    "calibration-source", "calibration-revision", "result-status", "result-revision",
    "start-c1-x", "start-c1-y", "start-c2-x", "start-c2-y",
    "finish-c1-x", "finish-c1-y", "finish-c2-x", "finish-c2-y",
  ];
  const out: Hooks = {};
  for (const k of keys) out[k] = await el.getAttribute(`data-${k}`);
  return out;
}
const canonical = (h: Hooks) =>
  JSON.stringify({
    s1: [h["start-c1-x"], h["start-c1-y"], h["start-c2-x"], h["start-c2-y"]],
    f1: [h["finish-c1-x"], h["finish-c1-y"], h["finish-c2-x"], h["finish-c2-y"]],
  });

const SHOT = (name: string) => ({ path: `e2e/screenshots/calibration-${name}.png` });

test.describe("manual timing-zone authority — non-drift acceptance", () => {
  test.skip(({ isMobile }) => isMobile, "desktop non-drift flow runs once");

  test("confirmed gates survive refresh, resize, and navigation without drift", async ({ page }) => {
    // A. INITIAL STATE
    await signInFounder(page);
    await page.goto(`/sessions/${SESSION_ID}`);
    const initial = await readHooks(page);
    await page.screenshot(SHOT("initial"));

    expect(initial["calibration-source"]).toBe("manual_confirmed");
    expect(initial["calibration-revision"]).toBe("2");
    expect(initial["start-c1-x"]).toBe("0.16106848802395207"); // exact persisted canonical x
    const baseline = canonical(initial);

    // E. POLLING STABILITY — wait through >2 poll cycles (poller interval is 1.5s).
    await page.waitForTimeout(4000);
    expect(canonical(await readHooks(page))).toBe(baseline);

    // F. REFRESH
    await page.reload();
    const afterRefresh = await readHooks(page);
    await page.screenshot(SHOT("after-refresh"));
    expect(canonical(afterRefresh)).toBe(baseline);
    expect(afterRefresh["calibration-source"]).toBe("manual_confirmed");
    expect(afterRefresh["calibration-revision"]).toBe("2");

    // G. RESIZE to a materially different viewport — canonical (source-space) coords
    // must be byte-identical even though CSS pixels change.
    await page.setViewportSize({ width: 800, height: 1000 });
    await page.waitForTimeout(500);
    const afterResize = await readHooks(page);
    await page.screenshot(SHOT("after-resize"));
    expect(canonical(afterResize)).toBe(baseline);

    await page.setViewportSize({ width: 1440, height: 900 });

    // H. NAVIGATION away and back.
    await page.goto("/dashboard");
    await page.goto(`/sessions/${SESSION_ID}`);
    const afterNav = await readHooks(page);
    expect(canonical(afterNav)).toBe(baseline);
    expect(afterNav["calibration-source"]).toBe("manual_confirmed");

    // L. RESULT PRESENTATION — a current result renders without a stale banner.
    if (afterNav["result-status"] === "current") {
      await expect(page.getByText(/Recalculation pending/i)).toHaveCount(0);
      await expect(page.getByText(/Previous result/i)).toHaveCount(0);
    }
  });

  test("reset-to-auto shows a confirm step and cancel makes no change", async ({ page }) => {
    await signInFounder(page);
    await page.goto(`/sessions/${SESSION_ID}`);
    const before = await readHooks(page);

    // The authority controls live inside the collapsed "Detailed Systems" panel.
    await page.getByText("Detailed Systems").click();

    // J. RESET CANCEL — clicking Reset reveals a confirm affordance; Cancel reverts.
    await page.getByRole("button", { name: "Reset to auto" }).click();
    await expect(page.getByText(/Replace the confirmed manual zone/i)).toBeVisible();
    await page.screenshot(SHOT("reset-confirm"));
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText(/Replace the confirmed manual zone/i)).toHaveCount(0);

    // No mutation occurred.
    const after = await readHooks(page);
    expect(canonical(after)).toBe(canonical(before));
    expect(after["calibration-source"]).toBe("manual_confirmed");
    expect(after["calibration-revision"]).toBe(before["calibration-revision"]);
  });
});
