import { test, expect } from "@playwright/test";
import { PATHS } from "../helpers/constants";
import { assertClickableOrFind, auditPrimaryControls } from "../helpers/clickability";
import { auditCustomerNav, expectLoggedInShell, gotoStore } from "../helpers/nav";
import { recordFinding } from "../helpers/findings";

test.describe("Shell / navigation", () => {
  test("dashboard loads and primary CTAs are usable", async ({ page }) => {
    const loggedIn = await expectLoggedInShell(page);
    expect(loggedIn).toBeTruthy();

    await auditPrimaryControls(page, "dashboard");

    const shop = page.getByRole("link", { name: /browse shop|shop inventory|shop/i }).first();
    const decks = page.getByRole("link", { name: /my decks|decks/i }).first();
    const events = page.getByRole("link", { name: /events|calendar/i }).first();
    const collection = page.getByRole("link", { name: /collection/i }).first();

    for (const [label, loc] of [
      ["Shop", shop],
      ["My decks", decks],
      ["Events", events],
      ["Collection", collection],
    ] as const) {
      await assertClickableOrFind(page, loc, {
        label,
        surface: "dashboard",
        severity: "major",
        category: "navigation",
      });
    }

    const heading = page.locator("h1, h2").first();
    if ((await heading.count()) === 0) {
      recordFinding({
        severity: "major",
        category: "design",
        surface: "dashboard",
        url: page.url(),
        title: "Dashboard has no clear page heading",
        repro: "Open store home while logged in",
        evidence: await page
          .screenshot({ path: "e2e/artifacts/screens/dashboard-no-heading.png" })
          .then(() => "e2e/artifacts/screens/dashboard-no-heading.png")
          .catch(() => null),
        recommendation: "Give the store home a single clear hero/title so orientation is obvious.",
      });
    }
  });

  test("deep links: decks → shop → events → professor → back to dashboard", async ({ page }) => {
    for (const [surface, path] of [
      ["my-decks", PATHS.decks],
      ["shop", PATHS.shop],
      ["events", PATHS.events],
      ["professor", PATHS.professor],
    ] as const) {
      await gotoStore(page, path);
      await expect(page).not.toHaveURL(/\/scan(?:\/|$)/);
      await auditCustomerNav(page, surface).catch(() => {
        // Professor/setup may use CustomerDeckNav; shop may not — record softly.
        recordFinding({
          severity: "minor",
          category: "navigation",
          surface,
          url: page.url(),
          title: "CustomerDeckNav not fully present on this surface",
          repro: `Visited ${path}`,
          evidence: null,
          recommendation:
            "Keep Dashboard / My decks / Shop / Events available from every deep customer screen.",
        });
      });
      await auditPrimaryControls(page, surface);
    }

    await gotoStore(page, PATHS.dashboard);
    await expect(page).toHaveURL(new RegExp(PATHS.dashboard.replace(/\//g, "\\/")));
  });

  test("scan routes are not entered by suite entry points", async ({ page }) => {
    await gotoStore(page, PATHS.dashboard);
    const scanLinks = page.locator(`a[href*="/scan"]`);
    const n = await scanLinks.count();
    // Note presence for the report; do not click.
    if (n > 0) {
      recordFinding({
        severity: "nit",
        category: "navigation",
        surface: "dashboard",
        url: page.url(),
        title: `Found ${n} scan-related link(s) — skipped by design`,
        repro: "Dashboard link inventory",
        evidence: null,
        recommendation: "No change required for this audit; scan is out of scope.",
      });
    }
  });
});
