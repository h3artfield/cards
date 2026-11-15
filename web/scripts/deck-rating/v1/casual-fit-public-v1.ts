#!/usr/bin/env npx tsx
/**
 * Casual refit on Playgroup public-deck labels (commander-grouped CV).
 * Only run when usable Archidekt lists are in the thousands.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotRoot, writeJson } from "./lib";
import { familiesFromCardV1_1 } from "../../../src/lib/deck-rating/v1/tag-families-v1.1";
import { resolveOracleName, type OracleNameMap } from "../../../src/lib/deck-rating/v1/oracle-name-map";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";

const SHRINK_K = 120;
const PRIOR = 0.25;
const KEYS = ["commanderPrior", "interaction", "cardFlow", "manaBase"] as const;
type Key = (typeof KEYS)[number];
type Feat = Record<Key, number>;

function norm(s: string): string {
  return s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function shrink(wr: number, games: number): number {
  const n = Math.max(0, games);
  return (n / (n + SHRINK_K)) * wr + (SHRINK_K / (n + SHRINK_K)) * PRIOR;
}

function nnls(X: number[][], y: number[], wts: number[]): number[] {
  const w = KEYS.map(() => 0.05);
  const lr = 0.2;
  for (let step = 0; step < 600; step += 1) {
    const grad = KEYS.map(() => 0);
    let tw = 0;
    for (let i = 0; i < X.length; i += 1) {
      const wt = wts[i] ?? 1;
      tw += wt;
      let pred = PRIOR;
      for (let j = 0; j < KEYS.length; j += 1) pred += w[j]! * X[i]![j]!;
      const err = pred - y[i]!;
      for (let j = 0; j < KEYS.length; j += 1) grad[j]! += wt * err * X[i]![j]!;
    }
    for (let j = 0; j < w.length; j += 1) w[j] = Math.max(0, w[j]! - (lr / Math.max(tw, 1)) * grad[j]!);
  }
  return w;
}

export async function casualFitPublicV1(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const src = join(snap, "playgroup", "public-decks", "usable-archidekt-v1.json");
  if (!existsSync(src)) return { skipped: true, reason: "usable-archidekt-v1.json not written yet" };
  const payload = JSON.parse(readFileSync(src, "utf8")) as {
    n: { usableArchidektLists: number };
    usable: Array<{
      commander: string;
      games: number;
      label: number;
      nNames: number;
      decklistUrl: string;
    }>;
  };
  const moxPath = join(snap, "playgroup", "public-decks", "moxfield-from-playgroup", "usable-moxfield-v1.json");
  const moxN = existsSync(moxPath)
    ? Number((JSON.parse(readFileSync(moxPath, "utf8")) as { n?: { usable?: number } }).n?.usable ?? 0)
    : 0;
  const combined = payload.n.usableArchidektLists + moxN;
  if (combined < 1000) {
    const dest = join(snap, "fit", "casual-fit-public-v1.json");
    const report = {
      version: "deck-rating-casual-fit-public-v1",
      skipped: true,
      reason:
        "Usable Archidekt + Moxfield-linked Playgroup lists are not in the thousands; keep the precon-only casual fit and leave W unpublished.",
      n: { ...payload.n, usableMoxfieldLists: moxN, usableCombined: combined },
    };
    writeJson(dest, report);
    return report;
  }

  const commanders = JSON.parse(readFileSync(join(snap, "playgroup", "commander-table.json"), "utf8")) as {
    ranked: Array<{ name: string; winRatePct: number | null; games: number | null }>;
  };
  const cmdPrior = new Map<string, { wr: number; games: number }>();
  for (const c of commanders.ranked) {
    if (c.winRatePct == null || c.games == null) continue;
    cmdPrior.set(norm(c.name), { wr: c.winRatePct / 100, games: c.games });
  }
  const oracle = await loadSnapshotOracleNameMap(snap);
  const listsPath = join(snap, "playgroup", "public-decks", "archidekt-lists-v1.json");
  const lists = existsSync(listsPath)
    ? (JSON.parse(readFileSync(listsPath, "utf8")) as Record<string, Array<{ name: string; quantity: number }>>)
    : {};

  const rows = payload.usable
    .filter((d) => d.nNames >= 90 && lists[d.decklistUrl])
    .map((d) => {
      const pr = cmdPrior.get(norm(d.commander));
      const feat = features(lists[d.decklistUrl] ?? [], d.commander, pr, oracle);
      return { commander: d.commander, y: d.label, games: d.games, feat };
    });

  const byCmd = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byCmd.get(row.commander) ?? [];
    list.push(row);
    byCmd.set(row.commander, list);
  }
  const folds = [...byCmd.keys()].filter((k) => (byCmd.get(k)?.length ?? 0) >= 1);
  const errors: number[] = [];
  const cmdOnlyErrors: number[] = [];
  for (const held of folds) {
    const train = rows.filter((r) => r.commander !== held);
    const test = rows.filter((r) => r.commander === held);
    if (!train.length || !test.length) continue;
    const X = train.map((r) => KEYS.map((k) => r.feat[k]));
    const y = train.map((r) => r.y);
    const wts = train.map((r) => r.games);
    const w = nnls(X, y, wts);
    let se = 0;
    let ce = 0;
    let tw = 0;
    for (const row of test) {
      let p = PRIOR;
      for (let j = 0; j < KEYS.length; j += 1) p += w[j]! * row.feat[KEYS[j]!];
      se += row.games * Math.abs(p - row.y);
      ce += row.games * Math.abs(PRIOR + w[0]! * row.feat.commanderPrior - row.y);
      tw += row.games;
    }
    if (tw) {
      errors.push(se / tw);
      cmdOnlyErrors.push(ce / tw);
    }
  }

  const report = {
    version: "deck-rating-casual-fit-public-v1",
    n: rows.length,
    commanders: byCmd.size,
    folds: errors.length,
    weightedMae: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null,
    commanderOnlyMae: cmdOnlyErrors.length ? cmdOnlyErrors.reduce((a, b) => a + b, 0) / cmdOnlyErrors.length : null,
    beatsCommanderOnly:
      errors.length > 0 &&
      errors.reduce((a, b) => a + b, 0) / errors.length + 0.002 <
        cmdOnlyErrors.reduce((a, b) => a + b, 0) / cmdOnlyErrors.length,
  };
  writeJson(join(snap, "fit", "casual-fit-public-v1.json"), report);
  return report;
}

function features(
  cards: Array<{ name: string; quantity: number }>,
  commander: string,
  pr: { wr: number; games: number } | undefined,
  oracle: OracleNameMap,
): Feat {
  const commanderPrior = (pr ? shrink(pr.wr, pr.games) : PRIOR) - PRIOR;
  let land = 0;
  let nonland = 0;
  let nonbasic = 0;
  let interact = 0;
  let draw = 0;
  for (const card of cards) {
    const q = card.quantity ?? 1;
    const info = resolveOracleName(oracle, card.name);
    const typeLine = info?.typeLine ?? "";
    const fam = familiesFromCardV1_1({ typeLine, oracleText: info?.text ?? "" });
    const isLand = /\bland\b/i.test(typeLine);
    if (isLand) {
      land += q;
      if (!/\bbasic\b/i.test(typeLine)) nonbasic += q;
    } else {
      nonland += q;
      if (fam.has("interact")) interact += q;
      if (fam.has("draw") || fam.has("tutor")) draw += q;
    }
  }
  const tot = Math.max(land + nonland, 1);
  const landBand = 1 - Math.min(1, Math.abs(land / tot - 36 / 99) / 0.12);
  return {
    commanderPrior,
    interaction: interact / Math.max(nonland, 1),
    cardFlow: draw / Math.max(nonland, 1),
    manaBase: 0.6 * landBand + 0.4 * (land ? nonbasic / land : 0),
  };
}

if (require.main === module) {
  casualFitPublicV1()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
