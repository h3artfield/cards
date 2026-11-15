import { test, expect } from "@playwright/test";
import { PATHS } from "../helpers/constants";
import { assertClickableOrFind, auditPrimaryControls } from "../helpers/clickability";
import { recordFinding } from "../helpers/findings";
import { auditCustomerNav, gotoStore, noteCopyIssue } from "../helpers/nav";

test.describe("Professor SOL setup + build", () => {
  test("setup screen is readable and startable", async ({ page }) => {
    await gotoStore(page, PATHS.professor);
    await auditCustomerNav(page, "professor-setup");
    await auditPrimaryControls(page, "professor-setup");

    const body = await page.locator("body").innerText();
    if (!/commander|bracket|playstyle|build/i.test(body)) {
      await noteCopyIssue(
        page,
        "professor-setup",
        "Professor setup missing expected guidance terms",
        "Open /inventory/professor",
        "Label commander, bracket, and playstyle clearly before the primary CTA.",
        "major",
      );
    }

    const howCos = page.getByRole("link", { name: /how cos works|commander optimization|cos/i });
    if ((await howCos.count()) > 0) {
      await assertClickableOrFind(page, howCos.first(), {
        label: "How COS works",
        surface: "professor-setup",
        category: "navigation",
      });
    }

    const commanderField = page.locator("input").filter({ hasText: "" }).first();
    const inputs = page.locator("input:not([type='hidden']), textarea, [role='combobox']");
    if ((await inputs.count()) < 1) {
      recordFinding({
        severity: "blocker",
        category: "usability",
        surface: "professor-setup",
        url: page.url(),
        title: "No interactive inputs on Professor setup",
        repro: `Open ${PATHS.professor}`,
        evidence: await page
          .screenshot({ path: "e2e/artifacts/screens/professor-no-inputs.png", fullPage: true })
          .then(() => "e2e/artifacts/screens/professor-no-inputs.png")
          .catch(() => null),
        recommendation: "Restore commander/bracket controls on the Professor setup page.",
      });
    }

    // Prefer hand-build path link clarity from NewDeckApp cross-link if present
    const buildMyself = page.getByRole("link", { name: /build it myself|start a deck|new deck/i });
    if ((await buildMyself.count()) === 0 && !/build it myself/i.test(body)) {
      recordFinding({
        severity: "minor",
        category: "navigation",
        surface: "professor-setup",
        url: page.url(),
        title: "No obvious escape to hand-built deck from Professor setup",
        repro: "Scan professor setup for DIY path",
        evidence: null,
        recommendation: "Offer a clear alternative path to paste/import a list without a SOL build.",
      });
    }

    void commanderField;
  });

  test("how-cos-works page explains the score", async ({ page }) => {
    await gotoStore(page, PATHS.howCos);
    await auditPrimaryControls(page, "how-cos");
    const body = await page.locator("body").innerText();
    if (!/cos|optimization|score|grade/i.test(body)) {
      recordFinding({
        severity: "major",
        category: "copy",
        surface: "how-cos",
        url: page.url(),
        title: "How COS works page lacks explanatory content",
        repro: `Open ${PATHS.howCos}`,
        evidence: await page
          .screenshot({ path: "e2e/artifacts/screens/how-cos.png", fullPage: true })
          .then(() => "e2e/artifacts/screens/how-cos.png")
          .catch(() => null),
        recommendation: "Explain what COS measures in plain language with a path back to building.",
      });
    }
    const back = page.getByRole("link", { name: /back|professor|dashboard/i }).first();
    await assertClickableOrFind(page, back, {
      label: "Back / Professor",
      surface: "how-cos",
      category: "navigation",
    });
  });

  test("SOL build entry UX (short probe; full model run optional)", async ({ page }) => {
    test.setTimeout(180_000);
    await gotoStore(page, PATHS.professor);
    await page.waitForTimeout(1000);

    const existing = page.locator(`a[href*="buildId="]`).first();
    if ((await existing.count()) > 0) {
      await existing.click({ timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(1500);
      const body = await page.locator("body").innerText();
      if (/build failed|couldn't finish/i.test(body)) {
        recordFinding({
          severity: "blocker",
          category: "reliability",
          surface: "sol-build",
          url: page.url(),
          title: "Existing SOL build shows failed state",
          repro: "Opened existing buildId from professor UI",
          evidence: await page
            .screenshot({ path: "e2e/artifacts/screens/sol-failed.png", fullPage: true })
            .then(() => "e2e/artifacts/screens/sol-failed.png")
            .catch(() => null),
          recommendation: "Ensure Head Professor model pin and build pipeline succeed on staging.",
        });
        const tryAgain = page.getByRole("button", { name: /try again/i });
        if ((await tryAgain.count()) > 0) {
          await assertClickableOrFind(page, tryAgain, {
            label: "Try again",
            surface: "sol-build",
            severity: "major",
          });
        }
      } else {
        await auditPrimaryControls(page, "sol-build-resume");
      }
      return;
    }

    const body = await page.locator("body").innerText();
    const inputs = page.locator("input:visible");
    if ((await inputs.count()) === 0) {
      recordFinding({
        severity: "blocker",
        category: "usability",
        surface: "sol-build",
        url: page.url(),
        title: "Cannot start SOL build — no visible inputs",
        repro: "Professor setup",
        evidence: await page
          .screenshot({ path: "e2e/artifacts/screens/sol-no-inputs.png", fullPage: true })
          .then(() => "e2e/artifacts/screens/sol-no-inputs.png")
          .catch(() => null),
        recommendation: "Restore commander/bracket controls on the Professor setup page.",
      });
      return;
    }

    // Probe start CTA clarity without waiting for a full model run (expensive / flaky).
    const start = page.getByRole("button", { name: /build|start|brew/i }).first();
    if ((await start.count()) === 0) {
      recordFinding({
        severity: "major",
        category: "usability",
        surface: "sol-build",
        url: page.url(),
        title: "No clear Start/Build CTA on Professor setup",
        repro: `Body preview: ${body.slice(0, 200)}`,
        evidence: await page
          .screenshot({ path: "e2e/artifacts/screens/sol-no-cta.png", fullPage: true })
          .then(() => "e2e/artifacts/screens/sol-no-cta.png")
          .catch(() => null),
        recommendation: "Primary CTA to start the build should be obvious after required fields are set.",
      });
    } else {
      await assertClickableOrFind(page, start, {
        label: "Start SOL build",
        surface: "sol-build",
        severity: "major",
      });
    }

    if (process.env.UX_LIVE_SOL_BUILD === "1") {
      await inputs.first().fill("Krenko, Mob Boss");
      await page.waitForTimeout(800);
      await page.getByText(/Krenko, Mob Boss/i).first().click({ timeout: 5_000 }).catch(() => undefined);
      if ((await start.count()) > 0) await start.click({ timeout: 5_000 }).catch(() => undefined);
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await page.waitForTimeout(3000);
        const text = await page.locator("body").innerText();
        if (/build failed|couldn't finish|deck complete|try again/i.test(text)) {
          if (/build failed|couldn't finish/i.test(text)) {
            recordFinding({
              severity: "blocker",
              category: "reliability",
              surface: "sol-build",
              url: page.url(),
              title: "Live SOL build failed",
              repro: "UX_LIVE_SOL_BUILD=1 Krenko run",
              evidence: await page
                .screenshot({ path: "e2e/artifacts/screens/sol-live-failed.png", fullPage: true })
                .then(() => "e2e/artifacts/screens/sol-live-failed.png")
                .catch(() => null),
              recommendation: "Fix build pipeline failures exposed in Cloud Run logs.",
            });
          }
          break;
        }
      }
    } else {
      recordFinding({
        severity: "nit",
        category: "reliability",
        surface: "sol-build",
        url: page.url(),
        title: "Full live SOL model run skipped (set UX_LIVE_SOL_BUILD=1 to enable)",
        repro: "Default suite probes setup CTA only",
        evidence: null,
        recommendation: "Periodically run with UX_LIVE_SOL_BUILD=1 after deploys that touch the build pipeline.",
      });
    }

    expect(true).toBeTruthy();
  });
});
