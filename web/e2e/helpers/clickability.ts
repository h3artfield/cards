import type { Locator, Page } from "@playwright/test";
import { recordFinding } from "./findings";

const MIN_TAP = 44;

export type ClickCheckResult = {
  ok: boolean;
  label: string;
  visible: boolean;
  enabled: boolean;
  inViewport: boolean;
  width: number;
  height: number;
  reason?: string;
};

export async function inspectClickable(
  locator: Locator,
  label: string,
): Promise<ClickCheckResult> {
  const count = await locator.count();
  if (count === 0) {
    return {
      ok: false,
      label,
      visible: false,
      enabled: false,
      inViewport: false,
      width: 0,
      height: 0,
      reason: "not found",
    };
  }
  const el = locator.first();
  const visible = await el.isVisible().catch(() => false);
  const enabled = await el.isEnabled().catch(() => false);
  const box = await el.boundingBox().catch(() => null);
  const width = box?.width ?? 0;
  const height = box?.height ?? 0;
  const inViewport = Boolean(box && width > 0 && height > 0);
  let reason: string | undefined;
  if (!visible) reason = "not visible";
  else if (!enabled) reason = "disabled";
  else if (!inViewport) reason = "no hit target / offscreen";
  else if (width < 8 || height < 8) reason = `tiny hit target ${width.toFixed(0)}x${height.toFixed(0)}`;
  return {
    ok: !reason,
    label,
    visible,
    enabled,
    inViewport,
    width,
    height,
    reason,
  };
}

export async function assertClickableOrFind(
  page: Page,
  locator: Locator,
  opts: {
    label: string;
    surface: string;
    severity?: "blocker" | "major" | "minor" | "nit";
    category?: "interaction" | "a11y" | "usability";
    minTap?: boolean;
  },
): Promise<ClickCheckResult> {
  const result = await inspectClickable(locator, opts.label);
  if (!result.ok) {
    const shot = pathSafe(`${opts.surface}-${opts.label}`);
    const evidence = await page
      .screenshot({ path: `e2e/artifacts/screens/${shot}.png`, fullPage: false })
      .then(() => `e2e/artifacts/screens/${shot}.png`)
      .catch(() => null);
    recordFinding({
      severity: opts.severity ?? "major",
      category: opts.category ?? "interaction",
      surface: opts.surface,
      url: page.url(),
      title: `${opts.label} is not clickable`,
      repro: result.reason ?? "unknown",
      evidence,
      recommendation: `Make "${opts.label}" visible, enabled, and large enough to click/tap.`,
    });
  } else if (opts.minTap && (result.width < MIN_TAP || result.height < MIN_TAP)) {
    const shot = pathSafe(`${opts.surface}-${opts.label}-tap`);
    const evidence = await page
      .screenshot({ path: `e2e/artifacts/screens/${shot}.png`, fullPage: false })
      .then(() => `e2e/artifacts/screens/${shot}.png`)
      .catch(() => null);
    recordFinding({
      severity: "minor",
      category: "a11y",
      surface: opts.surface,
      url: page.url(),
      title: `${opts.label} tap target under ${MIN_TAP}px`,
      repro: `Hit target ${result.width.toFixed(0)}x${result.height.toFixed(0)}`,
      evidence,
      recommendation: `Increase interactive size of "${opts.label}" to at least ${MIN_TAP}×${MIN_TAP} on touch layouts.`,
    });
  }
  return result;
}

function pathSafe(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

/** Scan primary interactive elements for dead / tiny controls. */
export async function auditPrimaryControls(
  page: Page,
  surface: string,
  selectors: string[] = [
    "a[href]",
    "button:not([disabled])",
    "[role='button']",
    "input[type='submit']",
  ],
) {
  const seen = new Set<string>();
  for (const sel of selectors) {
    const nodes = page.locator(sel);
    const n = Math.min(await nodes.count(), 40);
    for (let i = 0; i < n; i++) {
      const node = nodes.nth(i);
      const text =
        ((await node.innerText().catch(() => "")) || "").trim().replace(/\s+/g, " ").slice(0, 60) ||
        (await node.getAttribute("aria-label").catch(() => null)) ||
        sel;
      const key = `${sel}:${text}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const visible = await node.isVisible().catch(() => false);
      if (!visible) continue;
      const box = await node.boundingBox().catch(() => null);
      if (!box) continue;
      if (box.width > 0 && box.height > 0 && (box.width < 8 || box.height < 8)) {
        recordFinding({
          severity: "major",
          category: "interaction",
          surface,
          url: page.url(),
          title: `Control has near-zero hit target: ${text}`,
          repro: `${sel} measured ${box.width.toFixed(1)}x${box.height.toFixed(1)}`,
          evidence: null,
          recommendation: "Ensure interactive controls have a usable hit area.",
        });
      }
    }
  }
}
