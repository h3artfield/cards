import { test } from "@playwright/test";
import { PATHS } from "../helpers/constants";
import { assertClickableOrFind, auditPrimaryControls } from "../helpers/clickability";
import { recordFinding } from "../helpers/findings";
import { gotoStore } from "../helpers/nav";

test.describe("Responsive / mobile", () => {
  test("dashboard and decks usable on mobile viewport", async ({ page }) => {
    for (const [surface, path] of [
      ["mobile-dashboard", PATHS.dashboard],
      ["mobile-decks", PATHS.decks],
      ["mobile-professor", PATHS.professor],
      ["mobile-events", PATHS.events],
    ] as const) {
      await gotoStore(page, path);
      await auditPrimaryControls(page, surface);

      // Horizontal overflow check
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
        };
      });
      if (overflow.scrollWidth > overflow.clientWidth + 8) {
        recordFinding({
          severity: "major",
          category: "design",
          surface,
          url: page.url(),
          title: "Horizontal page overflow on mobile",
          repro: `scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`,
          evidence: await page
            .screenshot({ path: `e2e/artifacts/screens/${surface}-overflow.png`, fullPage: true })
            .then(() => `e2e/artifacts/screens/${surface}-overflow.png`)
            .catch(() => null),
          recommendation: "Tighten mobile layout so content fits the viewport without sideways scroll.",
        });
      }

      const primary = page
        .getByRole("link")
        .or(page.getByRole("button"))
        .filter({ hasText: /deck|shop|event|build|start/i })
        .first();
      if ((await primary.count()) > 0) {
        await assertClickableOrFind(page, primary, {
          label: "Primary mobile CTA",
          surface,
          minTap: true,
          severity: "major",
        });
      }
    }
  });
});
