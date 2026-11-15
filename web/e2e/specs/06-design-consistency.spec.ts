import { test } from "@playwright/test";
import { PATHS } from "../helpers/constants";
import { recordFinding } from "../helpers/findings";
import { gotoStore } from "../helpers/nav";

const SURFACES: { name: string; path: string }[] = [
  { name: "dashboard", path: PATHS.dashboard },
  { name: "decks", path: PATHS.decks },
  { name: "decks-new", path: PATHS.decksNew },
  { name: "professor", path: PATHS.professor },
  { name: "shop", path: PATHS.shop },
  { name: "events", path: PATHS.events },
  { name: "collection", path: PATHS.collection },
];

test.describe("Design / consistency pass", () => {
  test("competing CTAs, clipped text, empty chrome", async ({ page }) => {
    for (const s of SURFACES) {
      await gotoStore(page, s.path);
      await page.waitForTimeout(400);

      const buttons = page.locator("button:visible, a:visible");
      const n = Math.min(await buttons.count(), 60);
      const labels: string[] = [];
      for (let i = 0; i < n; i++) {
        const t = ((await buttons.nth(i).innerText().catch(() => "")) || "")
          .trim()
          .replace(/\s+/g, " ");
        if (t) labels.push(t.slice(0, 80));
      }
      const primaryish = labels.filter((l) =>
        /start|build|buy|checkout|continue|save|register|sign/i.test(l),
      );
      if (primaryish.length >= 4) {
        recordFinding({
          severity: "minor",
          category: "design",
          surface: s.name,
          url: page.url(),
          title: `Many competing primary-sounding CTAs (${primaryish.length})`,
          repro: primaryish.slice(0, 8).join(" | "),
          evidence: await page
            .screenshot({ path: `e2e/artifacts/screens/design-${s.name}-ctas.png` })
            .then(() => `e2e/artifacts/screens/design-${s.name}-ctas.png`)
            .catch(() => null),
          recommendation: "Reduce to one primary CTA per viewport; demote secondary actions visually.",
        });
      }

      // Clipped / ellipsis-heavy interactive labels
      const clipped = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of Array.from(document.querySelectorAll("button, a"))) {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          if (el.scrollWidth > el.clientWidth + 2 && (el.textContent || "").trim().length > 0) {
            bad.push((el.textContent || "").trim().slice(0, 60));
          }
        }
        return bad.slice(0, 8);
      });
      if (clipped.length > 0) {
        recordFinding({
          severity: "minor",
          category: "design",
          surface: s.name,
          url: page.url(),
          title: "Clipped interactive text detected",
          repro: clipped.join(" | "),
          evidence: await page
            .screenshot({ path: `e2e/artifacts/screens/design-${s.name}-clip.png` })
            .then(() => `e2e/artifacts/screens/design-${s.name}-clip.png`)
            .catch(() => null),
          recommendation: "Allow controls to wrap or widen so labels stay readable.",
        });
      }

      const text = await page.locator("body").innerText();
      if (text.trim().length < 40) {
        recordFinding({
          severity: "major",
          category: "usability",
          surface: s.name,
          url: page.url(),
          title: "Page appears nearly empty",
          repro: `Open ${s.path}`,
          evidence: await page
            .screenshot({ path: `e2e/artifacts/screens/design-${s.name}-empty.png`, fullPage: true })
            .then(() => `e2e/artifacts/screens/design-${s.name}-empty.png`)
            .catch(() => null),
          recommendation: "Avoid blank states without explanation and a next action.",
        });
      }
    }
  });
});
