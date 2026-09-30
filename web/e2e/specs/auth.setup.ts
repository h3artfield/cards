import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { EXPECTED_EMAIL, PATHS, STORE_PATH } from "../helpers/constants";

const AUTH_DIR = path.join(__dirname, "..", ".auth");
const AUTH_FILE = path.join(AUTH_DIR, "customer.json");

setup("authenticate customer via Google", async ({ browser }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.mkdirSync(path.join(__dirname, "..", "artifacts", "screens"), { recursive: true });

  const useExisting = fs.existsSync(AUTH_FILE) && process.env.UX_FORCE_AUTH !== "1";
  const context = await browser.newContext(
    useExisting ? { storageState: AUTH_FILE } : {},
  );
  const page = await context.newPage();

  await page.goto(STORE_PATH, { waitUntil: "domcontentloaded" });
  // Store home fetches /api/store/:slug before rendering CTAs — can take a while on cold start.
  await page
    .getByRole("link", { name: /continue with google|sign out|my decks|shop|collection|events/i })
    .first()
    .waitFor({ state: "visible", timeout: 120_000 });

  let body = await page.locator("body").innerText();
  let alreadyIn =
    (/sign out/i.test(body) || (/my decks/i.test(body) && /collection/i.test(body))) &&
    !/continue with google/i.test(body);

  if (alreadyIn) {
    console.log("Existing customer session is valid; refreshing storageState.");
    await context.storageState({ path: AUTH_FILE });
    await context.close();
    return;
  }

  if (!alreadyIn) {
    const google = page
      .locator(`a[href*="/api/auth/google"]`)
      .or(page.getByRole("link", { name: /continue with google/i }))
      .first();
    await google.waitFor({ state: "visible", timeout: 30_000 });
    await google.click();

    console.log("\n=== UX AUTH ===");
    console.log(`Complete Google sign-in as ${EXPECTED_EMAIL} in the browser window.`);
    console.log(`Waiting up to 5 minutes for return to the store...\n`);

    await page.waitForURL(
      (url) => url.host.includes("cardscanner9000.com") && !url.pathname.includes("/api/auth"),
      { timeout: 300_000 },
    );
    await page.waitForTimeout(1500);
  }

  await page.goto(PATHS.dashboard, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  body = await page.locator("body").innerText();
  alreadyIn = !/continue with google/i.test(body);
  expect(alreadyIn, "expected authenticated store shell after login").toBeTruthy();

  await context.storageState({ path: AUTH_FILE });
  console.log(`Saved customer storageState → ${AUTH_FILE}`);
  await context.close();
});
