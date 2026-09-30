import type { Page } from "@playwright/test";
import { PATHS, STORE_SLUG } from "./constants";
import { assertClickableOrFind, auditPrimaryControls } from "./clickability";
import { recordFinding } from "./findings";

export async function gotoStore(page: Page, path: string = PATHS.dashboard) {
  const res = await page.goto(path, { waitUntil: "domcontentloaded" });
  if (!res || res.status() >= 400) {
    recordFinding({
      severity: "blocker",
      category: "reliability",
      surface: "navigation",
      url: path,
      title: `Navigation failed (${res?.status() ?? "no response"})`,
      repro: `GET ${path}`,
      evidence: null,
      recommendation: "Fix routing or auth gate so customers can reach this page.",
    });
  }
  await page.waitForTimeout(500);
  return res;
}

export async function expectLoggedInShell(page: Page) {
  await gotoStore(page, PATHS.dashboard);
  const body = await page.locator("body").innerText();
  const looksGuest =
    /continue with google/i.test(body) &&
    !/sign out|my decks|orders|account/i.test(body);
  if (looksGuest) {
    recordFinding({
      severity: "blocker",
      category: "reliability",
      surface: "auth",
      url: page.url(),
      title: "Customer session missing — still seeing guest sign-in",
      repro: "Open store dashboard with saved storageState",
      evidence: await page
        .screenshot({ path: "e2e/artifacts/screens/auth-missing.png" })
        .then(() => "e2e/artifacts/screens/auth-missing.png")
        .catch(() => null),
      recommendation: "Re-run e2e:ux:auth and complete Google login as the test customer.",
    });
  }
  return !looksGuest;
}

export async function auditCustomerNav(page: Page, surface: string) {
  const checks: { name: string; hrefPart: string }[] = [
    { name: "Dashboard", hrefPart: `/s/${STORE_SLUG}` },
    { name: "My decks", hrefPart: "/decks" },
    { name: "Shop", hrefPart: "/inventory" },
    { name: "Events", hrefPart: "/calendar" },
  ];
  for (const c of checks) {
    const link = page
      .locator(`a[href*="${c.hrefPart}"]`)
      .filter({ hasText: new RegExp(c.name, "i") })
      .first();
    const alt = page.getByRole("link", { name: new RegExp(c.name, "i") }).first();
    const target = (await link.count()) > 0 ? link : alt;
    await assertClickableOrFind(page, target, {
      label: c.name,
      surface,
      severity: "major",
      category: "navigation",
    });
  }
  await auditPrimaryControls(page, surface);
}

export async function noteCopyIssue(
  page: Page,
  surface: string,
  title: string,
  repro: string,
  recommendation: string,
  severity: "major" | "minor" | "nit" = "minor",
) {
  recordFinding({
    severity,
    category: "copy",
    surface,
    url: page.url(),
    title,
    repro,
    evidence: await page
      .screenshot({
        path: `e2e/artifacts/screens/${surface.replace(/\W+/g, "-")}-copy.png`,
      })
      .then(() => `e2e/artifacts/screens/${surface.replace(/\W+/g, "-")}-copy.png`)
      .catch(() => null),
    recommendation,
  });
}
