/**
 * Offline Professor v4.2 playtest — captures screenshots of Meren + Chatterfang flows.
 * Usage: node scripts/playtest-professor-v4-2-offline.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../data/milestones/deck-synthesis/professor-v4-2-playtest-screenshots");
const BASE = process.env.PROFESSOR_PLAYTEST_URL ?? "http://localhost:3000";
const SLUG = process.env.PROFESSOR_PLAYTEST_SLUG ?? "the-game-lodge";

mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name) {
  const path = resolve(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log("screenshot:", path);
}

async function clickButtonWithText(page, text) {
  const btn = page.getByRole("button", { name: new RegExp(text, "i") }).first();
  await btn.waitFor({ state: "visible", timeout: 15000 });
  await btn.click();
}

async function runMeren(page) {
  await page.goto(`${BASE}/s/${SLUG}/inventory/professor`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, "01-commander-selection");

  await clickButtonWithText(page, "Meren of Clan Nel Toth");
  await page.waitForTimeout(600);
  await shot(page, "02-first-professor-dialogue");

  await clickButtonWithText(page, "Continue");
  await page.waitForTimeout(400);
  await shot(page, "03-archetype-choice");

  await clickButtonWithText(page, "Graveyard Toolbox");
  await page.waitForTimeout(400);
  await shot(page, "04-relationship-choice");

  await clickButtonWithText(page, "Interlocking Systems");
  await page.waitForTimeout(600);
  await shot(page, "05-first-tree-state");

  await clickButtonWithText(page, "Show me the structure");
  await page.waitForTimeout(500);
  await shot(page, "06-tree-after-grow-1");

  for (let i = 0; i < 4; i++) {
    const grow = page.getByRole("button", { name: /Show me the structure/i });
    if (await grow.isVisible().catch(() => false)) {
      await grow.click();
      await page.waitForTimeout(600);
    }
  }
  await shot(page, "07-tree-engines-packages");

  // Click a card node in SVG (circle, not text label)
  const cardCircle = page.locator("svg circle").filter({ has: page.locator("xpath=..") }).nth(8);
  const circles = page.locator("svg circle");
  const count = await circles.count();
  if (count > 6) {
    await circles.nth(count - 3).click({ force: true });
    await page.waitForTimeout(400);
    await shot(page, "08-card-inspector");
    const weirder = page.getByRole("button", { name: /FIND WEIRDER/i });
    if (await weirder.isVisible().catch(() => false)) {
      await weirder.click();
      await page.waitForTimeout(400);
      await shot(page, "09-find-weirder-result");
    }
  }

  await page.locator(".bg-\\[radial-gradient\\(ellipse_at_center\\,_\\#12121a_0\\%\\,_\\#07070a_70\\%\\)\\]").screenshot({
    path: resolve(OUT_DIR, "07b-tree-canvas-only.png"),
  }).catch(() => {});

  await shot(page, "10-idea-board-sidebar");

  // Advance to complete if choices remain
  const keep = page.getByRole("button", { name: /Keep Brewing/i });
  if (await keep.isVisible().catch(() => false)) {
    await keep.click();
  }
  await page.waitForTimeout(400);
  await shot(page, "11-meren-final-state");
}

async function runChatterfang(page) {
  await page.goto(`${BASE}/s/${SLUG}/inventory/professor`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  await clickButtonWithText(page, "Chatterfang");
  await clickButtonWithText(page, "Continue");
  await clickButtonWithText(page, "Graveyard Toolbox");
  if (await page.getByRole("button", { name: /Commander Focus/i }).isVisible().catch(() => false)) {
    await clickButtonWithText(page, "Commander Focus");
  } else {
    await clickButtonWithText(page, "Interlocking Systems");
  }

  for (let i = 0; i < 5; i++) {
    const grow = page.getByRole("button", { name: /Show me the structure/i });
    if (await grow.isVisible().catch(() => false)) {
      await grow.click();
      await page.waitForTimeout(500);
    }
  }

  await shot(page, "12-chatterfang-discovery-interrupt");

  const showMe = page.getByRole("button", { name: /Show me/i });
  if (await showMe.isVisible().catch(() => false)) {
    await showMe.click();
    await page.waitForTimeout(600);
    await shot(page, "13-chatterfang-cross-resource-branch");
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await runMeren(page);
    await runChatterfang(page);
  } finally {
    await browser.close();
  }
  console.log("Done. Screenshots in:", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
