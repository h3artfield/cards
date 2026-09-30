import { test, expect } from "@playwright/test";
import { PATHS } from "../helpers/constants";
import { assertClickableOrFind, auditPrimaryControls } from "../helpers/clickability";
import { loadDeckFixtures, pasteBody } from "../helpers/decks";
import { recordFinding } from "../helpers/findings";
import { auditCustomerNav, gotoStore } from "../helpers/nav";

test.describe("My decks + hand import fixtures", () => {
  test("my decks list is understandable", async ({ page }) => {
    await gotoStore(page, PATHS.decks);
    await auditCustomerNav(page, "my-decks");
    await auditPrimaryControls(page, "my-decks");

    const newDeck = page
      .getByRole("link", { name: /new (deck|build)|start a deck|build/i })
      .or(page.getByRole("button", { name: /new (deck|build)|start/i }))
      .first();
    await assertClickableOrFind(page, newDeck, {
      label: "New deck / build",
      surface: "my-decks",
      severity: "blocker",
      category: "navigation",
    });

    const body = await page.locator("body").innerText();
    if (!/deck/i.test(body)) {
      recordFinding({
        severity: "major",
        category: "usability",
        surface: "my-decks",
        url: page.url(),
        title: "My decks page lacks clear deck-oriented copy",
        repro: "Open /decks",
        evidence: await page
          .screenshot({ path: "e2e/artifacts/screens/my-decks-copy.png" })
          .then(() => "e2e/artifacts/screens/my-decks-copy.png")
          .catch(() => null),
        recommendation: "Lead with what this page is for and the primary action to create a deck.",
      });
    }
  });

  for (const fixture of loadDeckFixtures()) {
    test(`hand-import fixture: ${fixture.id}`, async ({ page }) => {
      test.setTimeout(180_000);
      await gotoStore(page, PATHS.decksNew);
      await page.waitForTimeout(800);

      // Commander picker
      const commanderInput = page.locator("#new-deck-commander, input[id*='commander']").first();
      if ((await commanderInput.count()) === 0) {
        recordFinding({
          severity: "blocker",
          category: "usability",
          surface: "hand-import",
          url: page.url(),
          title: "Commander picker input not found on new deck page",
          repro: `Open ${PATHS.decksNew}`,
          evidence: await page
            .screenshot({ path: `e2e/artifacts/screens/${fixture.id}-no-commander.png` })
            .then(() => `e2e/artifacts/screens/${fixture.id}-no-commander.png`)
            .catch(() => null),
          recommendation: "Expose a clearly labeled commander search field on Start a deck.",
        });
        return;
      }

      await commanderInput.click();
      await commanderInput.fill(fixture.commander);
      await page.waitForTimeout(1200);
      const option = page
        .getByRole("option", { name: new RegExp(fixture.commander.split(",")[0]!, "i") })
        .or(page.locator('[role="listbox"] >> text=' + fixture.commander.split(",")[0]!))
        .or(page.getByText(fixture.commander, { exact: false }).first());
      if ((await option.count()) > 0) {
        await option.first().click();
      } else {
        // Try pressing Enter / first result row
        const result = page.locator("button, [role='option'], li").filter({
          hasText: new RegExp(fixture.commander.split(",")[0]!, "i"),
        }).first();
        if ((await result.count()) > 0) await result.click();
        else {
          recordFinding({
            severity: "major",
            category: "usability",
            surface: "hand-import",
            url: page.url(),
            title: `Could not select commander ${fixture.commander}`,
            repro: `Typed commander name on new deck for ${fixture.id}`,
            evidence: await page
              .screenshot({ path: `e2e/artifacts/screens/${fixture.id}-pick.png` })
              .then(() => `e2e/artifacts/screens/${fixture.id}-pick.png`)
              .catch(() => null),
            recommendation: "Commander search results should be keyboard/mouse selectable within 1s.",
          });
          return;
        }
      }

      await page.getByRole("button", { name: /paste a list/i }).click().catch(async () => {
        const pasteToggle = page.getByText(/paste a list/i).first();
        if ((await pasteToggle.count()) > 0) await pasteToggle.click();
      });
      await page.waitForTimeout(300);
      const textarea = page.locator("#new-deck-paste, textarea").first();
      await assertClickableOrFind(page, textarea, {
        label: "Paste list textarea",
        surface: "hand-import",
        severity: "blocker",
      });
      await textarea.fill(pasteBody(fixture));

      const nameInput = page.locator("#new-deck-name");
      if ((await nameInput.count()) > 0) {
        await nameInput.fill(`UX Audit ${fixture.id}`);
      }

      const start = page.getByRole("button", { name: /start deck/i });
      await assertClickableOrFind(page, start, {
        label: "Start deck",
        surface: "hand-import",
        severity: "blocker",
      });
      await start.click();

      // Expect editor or deck detail
      await page.waitForTimeout(2000);
      const url = page.url();
      const body = await page.locator("body").innerText();
      const inEditor =
        /editor|library|command zone|make this the commander|promote to commander|legal/i.test(
          body,
        ) || /decks\/[^/]+/.test(url);

      if (!inEditor) {
        recordFinding({
          severity: "blocker",
          category: "reliability",
          surface: "hand-import",
          url,
          title: `Hand import did not reach editor for ${fixture.commander}`,
          repro: `Paste ${fixture.id} and Start deck`,
          evidence: await page
            .screenshot({ path: `e2e/artifacts/screens/${fixture.id}-after-start.png`, fullPage: true })
            .then(() => `e2e/artifacts/screens/${fixture.id}-after-start.png`)
            .catch(() => null),
          recommendation: "After Start deck, land in the editable deck workspace with clear next steps.",
        });
        return;
      }

      await auditPrimaryControls(page, `editor-${fixture.id}`);

      // Look for commander change affordance
      const promote = page.getByText(/promote to commander|make (this )?the commander|make commander/i);
      if ((await promote.count()) === 0) {
        recordFinding({
          severity: "minor",
          category: "usability",
          surface: "deck-editor",
          url: page.url(),
          title: "No visible promote/make-commander affordance after import",
          repro: `Imported ${fixture.id}`,
          evidence: null,
          recommendation:
            "Surface commander change in search, row actions, or hold-tray so players can find it without hunting.",
        });
      }

      expect(inEditor).toBeTruthy();
    });
  }
});
