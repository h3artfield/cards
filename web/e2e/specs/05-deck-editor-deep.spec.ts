import { test } from "@playwright/test";
import { PATHS } from "../helpers/constants";
import { assertClickableOrFind, auditPrimaryControls } from "../helpers/clickability";
import { loadDeckFixtures, pasteBody } from "../helpers/decks";
import { recordFinding } from "../helpers/findings";
import { gotoStore } from "../helpers/nav";

async function openEditorViaImport(page: import("@playwright/test").Page) {
  const fixture = loadDeckFixtures()[1]!; // Krenko — mono-red, fast
  await gotoStore(page, PATHS.decksNew);
  await page.waitForTimeout(800);
  const commanderInput = page.locator("#new-deck-commander").or(page.locator("input").first());
  await commanderInput.first().click();
  await commanderInput.first().fill(fixture.commander);
  await page.waitForTimeout(1200);
  const pick = page
    .getByRole("option", { name: new RegExp(fixture.commander.split(",")[0]!, "i") })
    .or(page.getByText(fixture.commander, { exact: false }))
    .first();
  if ((await pick.count()) > 0) await pick.click({ timeout: 5_000 }).catch(() => undefined);

  const pasteToggle = page.getByRole("button", { name: /paste a list/i }).or(page.getByText(/paste a list/i));
  if ((await pasteToggle.count()) > 0) await pasteToggle.first().click();
  await page.waitForTimeout(400);

  const textarea = page.locator("#new-deck-paste");
  if ((await textarea.count()) === 0) {
    recordFinding({
      severity: "blocker",
      category: "usability",
      surface: "deck-editor",
      url: page.url(),
      title: "Paste list textarea never appeared after toggle",
      repro: "Start a deck → Or paste a list you already have",
      evidence: await page
        .screenshot({ path: "e2e/artifacts/screens/editor-no-paste.png", fullPage: true })
        .then(() => "e2e/artifacts/screens/editor-no-paste.png")
        .catch(() => null),
      recommendation: "Paste toggle must reveal a usable textarea immediately.",
    });
    return fixture;
  }
  await textarea.fill(pasteBody(fixture));
  await page.locator("#new-deck-name").fill("UX Editor Deep Dive").catch(() => undefined);
  await page.getByRole("button", { name: /start deck/i }).click();
  await page.waitForTimeout(2500);
  return fixture;
}

test.describe("Deck editor deep UX", () => {
  test("search, legality, grouping, promote affordances", async ({ page }) => {
    test.setTimeout(180_000);
    await openEditorViaImport(page);
    await auditPrimaryControls(page, "deck-editor");

    const body = await page.locator("body").innerText();
    if (!/legal|99|commander/i.test(body)) {
      recordFinding({
        severity: "major",
        category: "copy",
        surface: "deck-editor",
        url: page.url(),
        title: "Editor lacks visible legality / size status",
        repro: "Open editor after import",
        evidence: await page
          .screenshot({ path: "e2e/artifacts/screens/editor-legality.png", fullPage: true })
          .then(() => "e2e/artifacts/screens/editor-legality.png")
          .catch(() => null),
        recommendation: "Keep library count and legality status visible without opening a menu.",
      });
    }

    // Card search
    const search = page
      .getByPlaceholder(/search|add card|card name/i)
      .or(page.locator("input[type='search']"))
      .or(page.locator("input").filter({ has: page.locator("xpath=..") }))
      .first();
    // Prefer labeled search near editor chrome
    const searchAlt = page.locator("input").nth(0);
    const searchBox = (await search.count()) > 0 ? search : searchAlt;
    await assertClickableOrFind(page, searchBox, {
      label: "Card search",
      surface: "deck-editor",
      severity: "major",
    });

    if ((await searchBox.count()) > 0) {
      await searchBox.fill("Sol Ring");
      await page.waitForTimeout(1000);
      const add = page.getByRole("button", { name: /add|make this the commander|\+/i }).first();
      if ((await add.count()) > 0) {
        await assertClickableOrFind(page, add, {
          label: "Add / search result action",
          surface: "deck-editor",
        });
      } else {
        recordFinding({
          severity: "major",
          category: "usability",
          surface: "deck-editor",
          url: page.url(),
          title: "Search for Sol Ring produced no obvious add action",
          repro: "Type Sol Ring in editor search",
          evidence: await page
            .screenshot({ path: "e2e/artifacts/screens/editor-search.png" })
            .then(() => "e2e/artifacts/screens/editor-search.png")
            .catch(() => null),
          recommendation: "Search results need a clear Add control; commander results should say Make commander.",
        });
      }
    }

    // Grouping controls
    const group = page.getByText(/group|type|mana|role/i).first();
    if ((await group.count()) === 0) {
      recordFinding({
        severity: "nit",
        category: "usability",
        surface: "deck-editor",
        url: page.url(),
        title: "No visible grouping control labels",
        repro: "Scan editor chrome",
        evidence: null,
        recommendation: "If grouping exists, label the axis control in plain language.",
      });
    }

    // Marker / tag affordance
    if (!/marker|tag|staple|wincon/i.test(body)) {
      recordFinding({
        severity: "nit",
        category: "usability",
        surface: "deck-editor",
        url: page.url(),
        title: "Marker/tag system not discoverable from first screen",
        repro: "Initial editor view after import",
        evidence: null,
        recommendation: "Hint that cards can be tagged/marked without requiring a long-press tutorial.",
      });
    }

    // Promote / commander change
    const cmdHint = page.getByText(/change commander|make this the commander|promote to commander/i);
    if ((await cmdHint.count()) === 0) {
      recordFinding({
        severity: "major",
        category: "usability",
        surface: "deck-editor",
        url: page.url(),
        title: "Commander change is not discoverable",
        repro: "Look for promote/make-commander copy after import",
        evidence: await page
          .screenshot({ path: "e2e/artifacts/screens/editor-commander-discover.png", fullPage: true })
          .then(() => "e2e/artifacts/screens/editor-commander-discover.png")
          .catch(() => null),
        recommendation:
          "Add short helper copy near the commander name and offer Promote on eligible hold-tray / row actions.",
      });
    }
  });
});
