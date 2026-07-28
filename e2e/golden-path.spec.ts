import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./fixture";

async function signIn(page:Page,email:string=E2E.ownerEmail){
  await page.goto("/login");
  await page.getByPlaceholder("Email",{exact:true}).fill(email);
  await page.getByPlaceholder("Password",{exact:true}).fill(E2E.password);
  await page.getByRole("button",{name:"Log in"}).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("golden athlete workflow",()=>{
  test.skip(({isMobile})=>isMobile,"desktop mutation flow runs once");

  test("owner signs in, sees session, opens results and Timing Workspace",async({page})=>{
    await signIn(page);
    await expect(page.getByText("Golden Path Sprinter")).toBeVisible();
    await page.getByText("Golden Path Sprinter").click();
    await expect(page.getByText("Golden Path Session")).toBeVisible();
    await page.getByText("Golden Path Session").click();
    await expect(page.getByRole("heading",{name:"Golden Path Session"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Working Analysis"})).toBeVisible();
    await page.getByRole("link",{name:"Open Timing Workspace"}).click();
    await expect(page.getByText("Timing Workspace unavailable")).toBeVisible();
  });

  test("report route is ownership protected and fails closed without a result contract",async({page})=>{
    await signIn(page);
    await page.goto(`/sessions/${E2E.sessionId}/report`);
    await expect(page.getByRole("heading",{name:"Report evidence unavailable"})).toBeVisible();
  });

  test("cross-user report access is denied by RLS",async({page})=>{
    await signIn(page,E2E.intruderEmail);
    await page.goto(`/sessions/${E2E.sessionId}/report`);
    await expect(page.getByText(/could not be found/i)).toBeVisible();
  });

  test("cross-user session access is denied by RLS",async({page})=>{
    await signIn(page,E2E.intruderEmail);
    await page.goto(`/sessions/${E2E.sessionId}`);
    await expect(page.getByText(/could not be found/i)).toBeVisible();
  });

  test("invalid upload is rejected before storage",async({page})=>{
    await signIn(page);
    await page.getByText("Golden Path Sprinter").click();
    await page.locator('input[type="file"]').setInputFiles({name:"not-video.exe",mimeType:"video/mp4",buffer:Buffer.from("not a video")});
    await page.getByRole("checkbox").check();
    await page.getByRole("button",{name:"Upload video"}).click();
    await expect(page.getByText("Use an MP4, MOV, or M4V source video.")).toBeVisible();
  });

  test("completed working analysis can be saved then reset without exposing versions",async({page})=>{
    await signIn(page);
    await page.goto(`/sessions/${E2E.sessionId}`);
    await page.getByRole("button",{name:"Save Version"}).click();
    await expect(page).toHaveURL(/saved_version=1/);
    await expect(page.getByText("Saved Versions")).toBeVisible();
    await page.getByRole("button",{name:"Reset Working Analysis"}).click();
    await expect(page).toHaveURL(/reset=1/);
    await expect(page.getByText(/No working analysis yet/)).toBeVisible();
  });

  test("sign out returns to login",async({page})=>{
    await signIn(page);
    await page.getByRole("button",{name:"Sign out"}).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test("mobile dashboard smoke test",async({page,isMobile})=>{
  test.skip(!isMobile,"mobile project only");
  await signIn(page);
  await expect(page.getByRole("heading",{name:"Your athletes"})).toBeVisible();
  await expect(page.getByText("Golden Path Sprinter")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x","scroll");
});

test("ordinary authenticated users cannot access the Research Workspace",async({page,isMobile})=>{
  test.skip(isMobile,"research authorization smoke test runs once");
  await signIn(page);
  await page.goto("/research");
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});

test("benchmark developer workspaces remain restricted by default",async({page,isMobile})=>{
  test.skip(isMobile,"benchmark authorization smoke test runs once");
  await signIn(page);
  await page.goto("/benchmarks");
  await expect(page.getByText(/could not be found/i)).toBeVisible();
  await page.goto("/comparisons");
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});

test("projection developer workspace remains restricted by default",async({page,isMobile})=>{
  test.skip(isMobile,"projection authorization smoke test runs once");
  await signIn(page);
  await page.goto("/projections");
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});

test("Digital Twin dashboard remains feature-gated by default",async({page,isMobile})=>{
  test.skip(isMobile,"Digital Twin authorization smoke test runs once");
  await signIn(page);
  await page.goto(`/athlete/intelligence?athleteId=${E2E.athleteId}`);
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});

test("Adaptive Coaching cache inspector remains feature-gated by default",async({page,isMobile})=>{
  test.skip(isMobile,"Adaptive Coaching authorization smoke test runs once");
  await signIn(page);
  await page.goto(`/coaching?athleteId=${E2E.athleteId}`);
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});
