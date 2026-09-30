import { test } from "@playwright/test";
import { PATHS } from "../helpers/constants";
import { assertClickableOrFind, auditPrimaryControls } from "../helpers/clickability";
import { recordFinding } from "../helpers/findings";
import { auditCustomerNav, gotoStore } from "../helpers/nav";

test.describe("Shop, events, collection (no scan)", () => {
  test("shop browse + cart cues", async ({ page }) => {
    await gotoStore(page, PATHS.shop);
    // Shop may redirect into professor — note if so.
    if (page.url().includes("/professor")) {
      recordFinding({
        severity: "major",
        category: "navigation",
        surface: "shop",
        url: page.url(),
        title: "Shop/inventory URL redirects into Professor",
        repro: `Open ${PATHS.shop}`,
        evidence: await page
          .screenshot({ path: "e2e/artifacts/screens/shop-redirect.png" })
          .then(() => "e2e/artifacts/screens/shop-redirect.png")
          .catch(() => null),
        recommendation:
          "Keep Shop as a commerce browse surface; Professor should be a separate nav destination.",
      });
    }
    await auditPrimaryControls(page, "shop");
    const body = await page.locator("body").innerText();
    const hasBrowse = /search|inventory|in stock|price|cart|\$/i.test(body);
    if (!hasBrowse) {
      recordFinding({
        severity: "major",
        category: "usability",
        surface: "shop",
        url: page.url(),
        title: "Shop surface does not read as a product browse experience",
        repro: `Open ${PATHS.shop}`,
        evidence: await page
          .screenshot({ path: "e2e/artifacts/screens/shop-body.png", fullPage: true })
          .then(() => "e2e/artifacts/screens/shop-body.png")
          .catch(() => null),
        recommendation: "Surface search, stock, and price cues immediately on Shop.",
      });
    }
    const cart = page.getByText(/cart/i).first();
    if ((await cart.count()) > 0) {
      await assertClickableOrFind(page, cart, {
        label: "Cart",
        surface: "shop",
        severity: "minor",
      });
    }
  });

  test("events / calendar discoverability", async ({ page }) => {
    await gotoStore(page, PATHS.events);
    await auditCustomerNav(page, "events").catch(() => undefined);
    await auditPrimaryControls(page, "events");
    const body = await page.locator("body").innerText();
    if (!/event|commander night|calendar|register|schedule/i.test(body)) {
      recordFinding({
        severity: "major",
        category: "usability",
        surface: "events",
        url: page.url(),
        title: "Events page lacks event-oriented content cues",
        repro: `Open ${PATHS.events}`,
        evidence: await page
          .screenshot({ path: "e2e/artifacts/screens/events.png", fullPage: true })
          .then(() => "e2e/artifacts/screens/events.png")
          .catch(() => null),
        recommendation: "Show upcoming events and how to register a deck in plain language.",
      });
    }
    const register = page.getByText(/register|sign up|rsvp/i).first();
    if ((await register.count()) > 0) {
      await assertClickableOrFind(page, register, {
        label: "Register / RSVP",
        surface: "events",
        category: "interaction",
      });
    } else {
      recordFinding({
        severity: "minor",
        category: "usability",
        surface: "events",
        url: page.url(),
        title: "No visible register/RSVP action on events",
        repro: "Scan events page",
        evidence: null,
        recommendation: "If registration exists, make the CTA visible without opening a deck first.",
      });
    }
  });

  test("collection binder/list without entering scan", async ({ page }) => {
    await gotoStore(page, PATHS.collection);
    await auditPrimaryControls(page, "collection");
    // Must not auto-navigate to scan
    if (/\/scan/.test(page.url())) {
      recordFinding({
        severity: "blocker",
        category: "navigation",
        surface: "collection",
        url: page.url(),
        title: "Collection auto-routed into scan",
        repro: `Open ${PATHS.collection}`,
        evidence: null,
        recommendation: "Default collection to binder/list; keep scan as an explicit opt-in.",
      });
      return;
    }
    const scanCta = page.locator(`a[href*="collection/scan"], a[href$="/scan"]`);
    // Do not click scan CTAs; only note them.
    if ((await scanCta.count()) > 0) {
      recordFinding({
        severity: "nit",
        category: "navigation",
        surface: "collection",
        url: page.url(),
        title: "Scan CTA present on collection (not exercised)",
        repro: "Collection page link inventory",
        evidence: null,
        recommendation: "Ensure scan is labeled as camera/scan so users do not confuse it with browse.",
      });
    }
    const body = await page.locator("body").innerText();
    if (!/collection|binder|owned|cards/i.test(body)) {
      recordFinding({
        severity: "major",
        category: "copy",
        surface: "collection",
        url: page.url(),
        title: "Collection page copy unclear",
        repro: `Open ${PATHS.collection}`,
        evidence: await page
          .screenshot({ path: "e2e/artifacts/screens/collection.png", fullPage: true })
          .then(() => "e2e/artifacts/screens/collection.png")
          .catch(() => null),
        recommendation: "Explain what Collection is for before asking the user to scan.",
      });
    }
  });
});
