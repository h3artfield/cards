#!/usr/bin/env npx tsx
/**
 * §6.4 Forge label collection (2-player Commander, seat alternating).
 *
 *   cd web && npx --yes tsx scripts/deck-rating/v1/forge-section64-collect-v1.ts --plan-only
 *   cd web && npx --yes tsx scripts/deck-rating/v1/forge-section64-collect-v1.ts --run
 */
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { repoWebRoot, snapshotRoot, writeJson } from "./lib";

const SEED = 2026092564;
const WORKERS = 8;
const CLOCK_S = 1801;
const GAMES_PER_MATCH = 20;
const GAMES_PER_SEAT = 10;
const XMX = "4096m";
const XMX_PREVIOUS = "2560m";
const VALIDATION_N = 40;
const GAUNTLET_N = 15;
const MAX_PER_COMMANDER = 2;
const MEDIAN_GAME_S = 30;

const EXCLUDE_CATS = new Set([
  "maybeboard",
  "sideboard",
  "considering",
  "wishlist",
  "maybe",
  "acquire",
  "want",
  "tokens",
  "token",
]);
const BASICS = new Set([
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Wastes",
  "Snow-Covered Plains",
  "Snow-Covered Island",
  "Snow-Covered Swamp",
  "Snow-Covered Mountain",
  "Snow-Covered Forest",
]);
const UPGRADES = ["Rhystic Study", "Cyclonic Rift", "Sol Ring"] as const;

type Band = "B2" | "B3" | "B4";
type Card = { name: string; quantity: number; cmc?: number };

type DeckRec = {
  id: string;
  name: string;
  band: Band;
  role: "validation" | "gauntlet" | "precon-stock" | "precon-add";
  commander: string;
  commanders: string[];
  source: string;
  archidektId?: number;
  playgroupName?: string;
  dckFile: string;
  main: Card[];
  excludedFrom?: string[];
};

type Matchup = {
  id: string;
  kind: "validation-vs-gauntlet" | "precon-strip-then-add";
  band: Band | "precon";
  heroId: string;
  oppId: string;
  heroDck: string;
  oppDck: string;
};

type SeatLog = { seat: 0 | 1; deckId: string; dck: string; life: number | null; poison: number | null };

type GameLog = {
  matchupId: string;
  kind: Matchup["kind"];
  band: Matchup["band"];
  heroId: string;
  oppId: string;
  seat: 0 | 1;
  gameIndex: number;
  result: "hero-win" | "opp-win" | "timeout" | "error";
  winner: string | null;
  turns: number | null;
  elapsedMs: number | null;
  seats: SeatLog[];
};

type CollectionPlan = {
  version: string;
  spec: string;
  startedAt: string;
  seed: number;
  chosen: {
    workers: number;
    clockS: number;
    gamesPerMatch: number;
    gamesPerSeat: number;
    aiProfile: string;
    xmx: string;
    xmxRaisedFrom?: string;
    xmxNote?: string;
    mode: string;
    knownLimitation: string;
  };
  sampling: {
    validationPerBand: number;
    gauntletPerBand: number;
    maxPerCommander: number;
    wDecileStratification: string;
    exclusions: string[];
  };
  nDecksPerBand: Record<Band, { validation: number; gauntlet: number; validationBackfillFromField: number; holdoutPoolScanned: number }>;
  decks: DeckRec[];
  matchupMatrix: Matchup[];
  nMatchups: number;
  nGamesPlanned: number;
  estimatedHours: number;
  logSchema: Record<string, string>;
  paths: Record<string, string>;
};

const PLAN_ONLY = process.argv.includes("--plan-only");
const RUN = process.argv.includes("--run") || !PLAN_ONLY;

function toolsRoot(): string {
  return resolve(repoWebRoot(), "data/milestones/deck-rating/v1/tools");
}

function findJava(root: string): string | null {
  const hits: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || !existsSync(dir)) return;
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isFile() && name.name.toLowerCase() === "java.exe") hits.push(p);
      else if (name.isDirectory()) walk(p, depth + 1);
    }
  };
  walk(root, 0);
  return hits[0] ?? null;
}

function findForgeJar(root: string): string | null {
  const hits: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 5 || !existsSync(dir)) return;
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isFile() && /^forge.*\.jar$/i.test(name.name) && !/installer/i.test(name.name)) hits.push(p);
      else if (name.isDirectory()) walk(p, depth + 1);
    }
  };
  walk(root, 0);
  return hits.find((p) => /forge-gui-desktop/i.test(p)) ?? hits[0] ?? null;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function stem(id: string): string {
  return id.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 80);
}

function dck(name: string, commander: string, main: Card[]): string {
  const lines = ["[metadata]", `Name=${name}`, "Deck Type=Commander", "[Commander]", `1 ${commander}`, "[Main]"];
  for (const c of main) {
    if (!c.name || c.name === commander) continue;
    lines.push(`${c.quantity ?? 1} ${c.name}`);
  }
  return `${lines.join("\n")}\n`;
}

function pinAiProfile(): void {
  const dir = join(process.env.APPDATA ?? "", "Forge");
  mkdirSync(join(dir, "preferences"), { recursive: true });
  const path = join(dir, "forge.preferences");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (/uiCurrentAIProfile/i.test(existing)) {
    const next = existing.replace(/uiCurrentAIProfile\s*=\s*.*/i, "uiCurrentAIProfile=Default");
    if (next !== existing) writeFileSync(path, next);
    return;
  }
  writeFileSync(path, existing ? `${existing.trimEnd()}\nuiCurrentAIProfile=Default\n` : "uiCurrentAIProfile=Default\n");
}

function excludedCategory(cats: string[]): boolean {
  return cats.some((c) => {
    const x = c.toLowerCase();
    return EXCLUDE_CATS.has(x) || x.startsWith("maybe-") || x.startsWith("maybeboard") || x.startsWith("sideboard");
  });
}

function parseArchidektCards(raw: Record<string, unknown>): { commanders: string[]; main: Card[] } | null {
  const cardsRaw = (raw.cards as Array<Record<string, unknown>> | undefined) ?? [];
  if (!cardsRaw.length) return null;
  const commanders: string[] = [];
  const main: Card[] = [];
  for (const rec of cardsRaw) {
    const card = (rec.card as Record<string, unknown> | undefined) ?? {};
    const oc = (card.oracleCard as Record<string, unknown> | undefined) ?? {};
    const name = String(oc.name ?? card.displayName ?? card.name ?? "").trim();
    if (!name) continue;
    const qty = Number(rec.quantity ?? 1) || 1;
    const cats = ((rec.categories as string[]) ?? []).map((c) => String(c).toLowerCase());
    if (excludedCategory(cats) && !cats.includes("commander") && !cats.includes("companion")) continue;
    const types = ((oc.types as string[]) ?? []).map((t) => t.toLowerCase());
    if (types.includes("token") || types.includes("emblem")) continue;
    const legal = ((oc.legalities as Record<string, string> | undefined) ?? {}).commander;
    if (legal === "banned" || legal === "not_legal") return null;
    if (cats.includes("commander")) commanders.push(name);
    else main.push({ name, quantity: qty, cmc: Number(oc.cmc ?? 0) || 0 });
  }
  if (!commanders.length) return null;
  const n = commanders.length + main.reduce((s, c) => s + c.quantity, 0);
  if (n < 90) return null;
  return { commanders, main };
}

function peekBracket(path: string): number | null {
  const buf = Buffer.alloc(1200);
  const fd = require("node:fs").openSync(path, "r");
  try {
    require("node:fs").readSync(fd, buf, 0, 1200, 0);
  } finally {
    require("node:fs").closeSync(fd);
  }
  const m = /"edhBracket"\s*:\s*(-?\d+|null)/.exec(buf.toString("utf8"));
  if (!m || m[1] === "null") return null;
  return Number(m[1]);
}

function takeCapped<T extends { commander: string }>(pool: T[], n: number, rng: () => number): T[] {
  const out: T[] = [];
  const per = new Map<string, number>();
  for (const row of shuffle(pool, rng)) {
    const key = row.commander || "unknown";
    if ((per.get(key) ?? 0) >= MAX_PER_COMMANDER) continue;
    per.set(key, (per.get(key) ?? 0) + 1);
    out.push(row);
    if (out.length >= n) break;
  }
  return out;
}

function stripThenAdd(main: Card[], commander: string): Card[] {
  const have = new Set(main.map((c) => c.name));
  have.add(commander);
  const add = UPGRADES.filter((n) => !have.has(n));
  const next = main.map((c) => ({ ...c }));
  let need = add.length;
  const dropQty = (pred: (c: Card) => boolean) => {
    for (let i = next.length - 1; i >= 0 && need > 0; i -= 1) {
      const c = next[i]!;
      if (!pred(c)) continue;
      if (c.quantity > 1) {
        c.quantity -= 1;
        need -= 1;
      } else {
        next.splice(i, 1);
        need -= 1;
      }
    }
  };
  dropQty((c) => BASICS.has(c.name));
  dropQty((c) => !BASICS.has(c.name));
  return [...next, ...add.map((name) => ({ name, quantity: 1, cmc: 0 }))];
}

function forgePaths() {
  const snap = snapshotRoot();
  const forge = join(snap, "forge");
  return {
    snap,
    forge,
    plan: join(forge, "section64-collection-plan-v1.json"),
    progress: join(forge, "section64-progress-v1.json"),
    games: join(forge, "section64-games-v1.jsonl"),
    matches: join(forge, "section64-matches-v1.jsonl"),
    log: join(forge, "section64-collect.log"),
    deckDir: join(forge, "section64-decks"),
  };
}

export function buildSection64Plan(): CollectionPlan {
  const snap = snapshotRoot();
  const paths = forgePaths();
  const rng = mulberry32(SEED);
  const fields = JSON.parse(readFileSync(join(snap, "fields", "FIELDS.json"), "utf8")) as {
    b2: { names: string[] };
  };
  const fieldB2 = new Set(fields.b2.names);
  const fieldB3 = JSON.parse(readFileSync(join(snap, "archidekt", "field-b3.json"), "utf8")) as Array<{
    archidektId: number;
    name: string;
    commanders: string[];
  }>;
  const fieldB4 = JSON.parse(readFileSync(join(snap, "archidekt", "field-b4.json"), "utf8")) as Array<{
    archidektId: number;
    name: string;
    commanders: string[];
  }>;
  const fieldIds = new Set([...fieldB3, ...fieldB4].map((r) => r.archidektId));
  const labels = JSON.parse(readFileSync(join(snap, "labels", "precon-labels.json"), "utf8")) as {
    decks: Array<{
      playgroupName: string;
      last3Years?: boolean;
      commanders: Array<{ name?: string }>;
      mainboard: Array<{ name?: string; quantity?: number }>;
    }>;
  };
  const fit = JSON.parse(readFileSync(join(snap, "fit", "casual-fit-v1.json"), "utf8")) as {
    labels: Array<{ name: string; measured: number; last3Years: boolean }>;
  };
  const measured = new Map(fit.labels.map((r) => [r.name, r]));
  const harness = JSON.parse(readFileSync(join(snap, "forge", "harness-jobs-v1.json"), "utf8")) as {
    jobs: Array<{ stockPrecon: string; commander: string }>;
  };

  const rawDir = join(snap, "archidekt", "raw");
  const loadRaw = (id: number) => {
    const p = join(rawDir, `${id}.json`);
    if (!existsSync(p)) return null;
    return parseArchidektCards(JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>);
  };

  const fieldToDeck = (band: Band, row: { archidektId: number; name: string; commanders: string[] }): DeckRec | null => {
    const parsed = loadRaw(row.archidektId);
    if (!parsed) return null;
    const commander = parsed.commanders[0] ?? row.commanders[0] ?? "Unknown";
    const id = `field-${band}-${row.archidektId}`;
    return {
      id,
      name: row.name,
      band,
      role: "gauntlet",
      commander,
      commanders: parsed.commanders,
      source: "archidekt-field",
      archidektId: row.archidektId,
      dckFile: `${stem(id)}.dck`,
      main: parsed.main,
    };
  };

  const preconToCards = (name: string) => {
    const src = labels.decks.find((d) => d.playgroupName === name);
    if (!src?.commanders[0]?.name) return null;
    return {
      commander: src.commanders[0].name!,
      commanders: src.commanders.map((c) => c.name).filter((n): n is string => Boolean(n)),
      main: src.mainboard.filter((c) => c.name).map((c) => ({ name: c.name!, quantity: c.quantity ?? 1 })),
    };
  };

  const b2FieldPool = fields.b2.names
    .map((name) => {
      const cards = preconToCards(name);
      if (!cards) return null;
      return {
        id: `field-B2-${stem(name)}`,
        name,
        band: "B2" as const,
        role: "gauntlet" as const,
        commander: cards.commander,
        commanders: cards.commanders,
        source: "precon-field",
        playgroupName: name,
        dckFile: "",
        main: cards.main,
      };
    })
    .filter((d): d is DeckRec => Boolean(d));

  const gauntletB2 = takeCapped(b2FieldPool, GAUNTLET_N, rng).map((d) => ({
    ...d,
    role: "gauntlet" as const,
    dckFile: `${stem(d.id)}.dck`,
  }));
  const gauntletB2Ids = new Set(gauntletB2.map((d) => d.id));

  const b2Holdout = labels.decks
    .filter((d) => {
      const m = measured.get(d.playgroupName);
      return m?.measured === 2 && !fieldB2.has(d.playgroupName) && d.commanders[0]?.name;
    })
    .map((d) => {
      const cards = preconToCards(d.playgroupName)!;
      return {
        id: `holdout-B2-${stem(d.playgroupName)}`,
        name: d.playgroupName,
        band: "B2" as const,
        role: "validation" as const,
        commander: cards.commander,
        commanders: cards.commanders,
        source: "precon-holdout",
        playgroupName: d.playgroupName,
        dckFile: "",
        main: cards.main,
        excludedFrom: ["field-B2"],
      };
    });
  const b2Backfill = b2FieldPool.filter((d) => !gauntletB2Ids.has(d.id));
  const b2PickedHoldout = takeCapped(b2Holdout, VALIDATION_N, rng);
  const b2Need = VALIDATION_N - b2PickedHoldout.length;
  const b2PickedField = b2Need > 0 ? takeCapped(b2Backfill, b2Need, rng) : [];
  const validationB2: DeckRec[] = [
    ...b2PickedHoldout.map((d) => ({ ...d, dckFile: `${stem(d.id)}.dck` })),
    ...b2PickedField.map((d) => ({
      ...d,
      id: d.id.replace(/^field-/, "val-"),
      role: "validation" as const,
      source: "precon-field-backfill",
      dckFile: `${stem(d.id.replace(/^field-/, "val-"))}.dck`,
      excludedFrom: ["gauntlet-B2"],
    })),
  ];

  const rawFiles = existsSync(rawDir) ? readdirSync(rawDir).filter((n) => n.endsWith(".json")) : [];
  const holdoutIds: Record<Band, number[]> = { B2: [], B3: [], B4: [] };
  for (const name of rawFiles) {
    const id = Number(name.replace(/\.json$/i, ""));
    if (!id || fieldIds.has(id)) continue;
    const br = peekBracket(join(rawDir, name));
    if (br === 3) holdoutIds.B3.push(id);
    else if (br === 4) holdoutIds.B4.push(id);
  }

  const pickUntil = <T,>(items: T[], n: number, parse: (item: T) => DeckRec | null): DeckRec[] => {
    const out: DeckRec[] = [];
    const per = new Map<string, number>();
    for (const item of shuffle(items, rng)) {
      const deck = parse(item);
      if (!deck) continue;
      const key = deck.commander || "unknown";
      if ((per.get(key) ?? 0) >= MAX_PER_COMMANDER) continue;
      per.set(key, (per.get(key) ?? 0) + 1);
      out.push(deck);
      if (out.length >= n) break;
    }
    return out;
  };

  const pickArchidektValidation = (band: Band, ids: number[]): DeckRec[] =>
    pickUntil(ids, VALIDATION_N, (id) => {
      const cards = loadRaw(id);
      if (!cards) return null;
      return {
        id: `holdout-${band}-${id}`,
        name: `archidekt-${id}`,
        band,
        role: "validation",
        commander: cards.commanders[0]!,
        commanders: cards.commanders,
        source: "archidekt-holdout",
        archidektId: id,
        dckFile: `${stem(`holdout-${band}-${id}`)}.dck`,
        main: cards.main,
        excludedFrom: ["field", "gauntlet"],
      };
    });

  const pickArchidektGauntlet = (band: Band, rows: Array<{ archidektId: number; name: string; commanders: string[] }>): DeckRec[] =>
    pickUntil(rows, GAUNTLET_N, (r) => fieldToDeck(band, r));

  const gauntletB3 = pickArchidektGauntlet("B3", fieldB3);
  const gauntletB4 = pickArchidektGauntlet("B4", fieldB4);
  const gauntletIds = new Set([...gauntletB3, ...gauntletB4].map((d) => d.archidektId).filter(Boolean));
  const validationB3 = pickArchidektValidation(
    "B3",
    holdoutIds.B3.filter((id) => !gauntletIds.has(id)),
  );
  const validationB4 = pickArchidektValidation(
    "B4",
    holdoutIds.B4.filter((id) => !gauntletIds.has(id)),
  );

  const nameById = new Map(labels.decks.map((d) => [d.playgroupName, d]));
  const preconDecks: DeckRec[] = [];
  for (const job of harness.jobs) {
    const src = nameById.get(job.stockPrecon);
    if (!src?.commanders[0]?.name) continue;
    const commander = src.commanders[0].name!;
    const main = src.mainboard.filter((c) => c.name).map((c) => ({ name: c.name!, quantity: c.quantity ?? 1 }));
    const stockId = `precon-stock-${stem(job.stockPrecon)}`;
    const addId = `precon-add-${stem(job.stockPrecon)}`;
    preconDecks.push({
      id: stockId,
      name: `${job.stockPrecon} stock`,
      band: "B2",
      role: "precon-stock",
      commander,
      commanders: [commander],
      source: "gate4-precon",
      playgroupName: job.stockPrecon,
      dckFile: `${stem(stockId)}.dck`,
      main,
    });
    preconDecks.push({
      id: addId,
      name: `${job.stockPrecon} strip-then-add`,
      band: "B2",
      role: "precon-add",
      commander,
      commanders: [commander],
      source: "gate4-precon",
      playgroupName: job.stockPrecon,
      dckFile: `${stem(addId)}.dck`,
      main: stripThenAdd(main, commander),
    });
  }

  const decks: DeckRec[] = [
    ...gauntletB2,
    ...gauntletB3,
    ...gauntletB4,
    ...validationB2,
    ...validationB3,
    ...validationB4,
    ...preconDecks,
  ];

  const matchupMatrix: Matchup[] = [];
  const pairBand = (band: Band, heroes: DeckRec[], gauntlet: DeckRec[]) => {
    for (const hero of heroes) {
      for (const opp of gauntlet) {
        matchupMatrix.push({
          id: `val:${band}:${hero.id}:${opp.id}`,
          kind: "validation-vs-gauntlet",
          band,
          heroId: hero.id,
          oppId: opp.id,
          heroDck: hero.dckFile,
          oppDck: opp.dckFile,
        });
      }
    }
  };
  pairBand("B2", validationB2, gauntletB2);
  pairBand("B3", validationB3, gauntletB3);
  pairBand("B4", validationB4, gauntletB4);
  for (let i = 0; i < preconDecks.length; i += 2) {
    const stock = preconDecks[i];
    const add = preconDecks[i + 1];
    if (!stock || !add) continue;
    matchupMatrix.push({
      id: `precon:${stock.playgroupName}`,
      kind: "precon-strip-then-add",
      band: "precon",
      heroId: add.id,
      oppId: stock.id,
      heroDck: add.dckFile,
      oppDck: stock.dckFile,
    });
  }

  const nGamesPlanned = matchupMatrix.length * GAMES_PER_MATCH;
  const estimatedHours = (nGamesPlanned * MEDIAN_GAME_S) / WORKERS / 3600;
  const startedAt = new Date().toISOString();
  const plan: CollectionPlan = {
    version: "deck-rating-forge-section64-collection-plan-v1",
    spec: "goldfish-policy-v2-addendum-§6.4",
    startedAt,
    seed: SEED,
    chosen: {
      workers: WORKERS,
      clockS: CLOCK_S,
      gamesPerMatch: GAMES_PER_MATCH,
      gamesPerSeat: GAMES_PER_SEAT,
      aiProfile: "Default",
      xmx: XMX,
      xmxRaisedFrom: XMX_PREVIOUS,
      xmxNote:
        "raised 2560m → 4096m after token-explosion LKI-copy OutOfMemoryError (Enduring Enchantments vs Blight Curse). 8×4096m ≈ 32GB max heap on ~64GB RAM; no -Xms so RSS stays lower until needed. 4p scaled left untouched.",
      mode: "2-player-commander",
      knownLimitation: "2-player is not the published 4-player table; seats alternate 10+10 per pairing",
    },
    sampling: {
      validationPerBand: VALIDATION_N,
      gauntletPerBand: GAUNTLET_N,
      maxPerCommander: MAX_PER_COMMANDER,
      wDecileStratification: "unavailable — W unpublished; stratified random within band",
      exclusions: [
        "frozen field B3/B4 identities (validation heroes)",
        "gauntlet opponents",
        "B2 field precons preferred-out; backfill only if holdout < 40",
      ],
    },
    nDecksPerBand: {
      B2: {
        validation: validationB2.length,
        gauntlet: gauntletB2.length,
        validationBackfillFromField: b2PickedField.length,
        holdoutPoolScanned: b2Holdout.length,
      },
      B3: {
        validation: validationB3.length,
        gauntlet: gauntletB3.length,
        validationBackfillFromField: 0,
        holdoutPoolScanned: holdoutIds.B3.length,
      },
      B4: {
        validation: validationB4.length,
        gauntlet: gauntletB4.length,
        validationBackfillFromField: 0,
        holdoutPoolScanned: holdoutIds.B4.length,
      },
    },
    decks,
    matchupMatrix,
    nMatchups: matchupMatrix.length,
    nGamesPlanned,
    estimatedHours: Math.round(estimatedHours * 10) / 10,
    logSchema: {
      matchupId: "string",
      result: "hero-win | opp-win | timeout | error",
      winner: "deck id or null on timeout",
      turns: "Game Outcome: Turn N, else null",
      elapsedMs: "Game Result elapsed ms",
      seats: "[{seat, deckId, life, poison}] — life/poison at timeout when Forge prints them, else null",
    },
    paths: {
      plan: paths.plan,
      progress: paths.progress,
      games: paths.games,
      matches: paths.matches,
      log: paths.log,
      deckDir: paths.deckDir,
    },
  };

  mkdirSync(paths.deckDir, { recursive: true });
  const commanderDir = join(process.env.APPDATA ?? "", "Forge", "decks", "commander");
  mkdirSync(commanderDir, { recursive: true });
  for (const deck of decks) {
    const body = dck(deck.dckFile.replace(/\.dck$/i, ""), deck.commander, deck.main);
    writeFileSync(join(paths.deckDir, deck.dckFile), body);
    copyFileSync(join(paths.deckDir, deck.dckFile), join(commanderDir, deck.dckFile));
  }
  writeJson(paths.plan, plan);
  return plan;
}

function runJava(java: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(java, args, { cwd, windowsHide: true });
    let out = "";
    let done = false;
    const finish = (code: number) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolvePromise({ code, out });
    };
    const timer = setTimeout(() => {
      out += `\n[harness] killed after ${timeoutMs}ms\n`;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000);
      finish(124);
    }, timeoutMs);
    child.stdout.on("data", (b) => {
      out += String(b);
    });
    child.stderr.on("data", (b) => {
      out += String(b);
    });
    child.on("exit", (code) => finish(code ?? 1));
    child.on("error", (err) => {
      out += String(err);
      finish(1);
    });
  });
}

function timeoutGame(matchup: Matchup, seat: 0 | 1, gameIndex: number, elapsedMs: number | null = CLOCK_S * 1000): GameLog {
  return {
    matchupId: matchup.id,
    kind: matchup.kind,
    band: matchup.band,
    heroId: matchup.heroId,
    oppId: matchup.oppId,
    seat,
    gameIndex,
    result: "timeout",
    winner: null,
    turns: null,
    elapsedMs,
    seats: [
      { seat: 0, deckId: matchup.heroId, dck: matchup.heroDck, life: null, poison: null },
      { seat: 1, deckId: matchup.oppId, dck: matchup.oppDck, life: null, poison: null },
    ],
  };
}

function classifyJvm(code: number, out: string): { oom: boolean; crash: boolean; vanished: boolean; padTimeout: boolean } {
  const oom = /java\.lang\.OutOfMemoryError|Java heap space|GC overhead limit exceeded/i.test(out);
  const vanished = code !== 0 && code !== 124 && !/Game Result:|Stopping slow match as draw/.test(out);
  const crash = oom || (code !== 0 && code !== 124);
  return { oom, crash, vanished, padTimeout: crash || vanished || code === 124 };
}

function parseSeatGames(out: string, matchup: Matchup, seat: 0 | 1, opts?: { crashTimeout?: boolean }): GameLog[] {
  const heroStem = matchup.heroDck.replace(/\.dck$/i, "");
  const oppStem = matchup.oppDck.replace(/\.dck$/i, "");
  const chunks = out.split(/(?=Game Result: Game |\nStopping slow match as draw)/g);
  const games: GameLog[] = [];
  let idx = 0;
  for (const chunk of chunks) {
    const ended = /Game Result: Game \d+ ended in (\d+) ms/.exec(chunk);
    const stopped = /Stopping slow match as draw/.test(chunk);
    if (!ended && !stopped) continue;
    const elapsedMs = ended ? Number(ended[1]) : CLOCK_S * 1000;
    const timeout = stopped || elapsedMs >= CLOCK_S * 1000 - 50;
    const turn = /Game Outcome: Turn (\d+)/.exec(chunk);
    const life = new Map<number, number>();
    const poison = new Map<number, number>();
    for (const m of chunk.matchAll(/Ai\((\d+)\)[^\n]*life total reached 0/gi)) life.set(Number(m[1]), 0);
    for (const m of chunk.matchAll(/Ai\((\d+)\)[^\n]*?(\d+)\s+life/gi)) life.set(Number(m[1]), Number(m[2]));
    for (const m of chunk.matchAll(/Ai\((\d+)\)[^\n]*?(\d+)\s+poison/gi)) poison.set(Number(m[1]), Number(m[2]));
    const winnerLine = /Game Result: Game \d+ ended in \d+ ms\. ([^\n]+?) has won/i.exec(chunk);
    const heroWon = winnerLine ? winnerLine[1]!.includes(heroStem) : /has won/i.test(chunk) && chunk.includes(heroStem);
    const oppWon = winnerLine ? winnerLine[1]!.includes(oppStem) : false;
    const result: GameLog["result"] = timeout ? "timeout" : heroWon ? "hero-win" : oppWon ? "opp-win" : "error";
    const heroSeat = seat === 0 ? 1 : 2;
    const oppSeat = seat === 0 ? 2 : 1;
    games.push({
      matchupId: matchup.id,
      kind: matchup.kind,
      band: matchup.band,
      heroId: matchup.heroId,
      oppId: matchup.oppId,
      seat,
      gameIndex: idx,
      result,
      winner: timeout ? null : result === "hero-win" ? matchup.heroId : result === "opp-win" ? matchup.oppId : null,
      turns: turn ? Number(turn[1]) : null,
      elapsedMs,
      seats: [
        { seat: 0, deckId: matchup.heroId, dck: matchup.heroDck, life: life.get(heroSeat) ?? null, poison: poison.get(heroSeat) ?? null },
        { seat: 1, deckId: matchup.oppId, dck: matchup.oppDck, life: life.get(oppSeat) ?? null, poison: poison.get(oppSeat) ?? null },
      ],
    });
    idx += 1;
  }
  if (opts?.crashTimeout) {
    while (games.length < GAMES_PER_SEAT) {
      games.push(timeoutGame(matchup, seat, games.length));
    }
    return games;
  }
  if (!games.length) {
    games.push({
      matchupId: matchup.id,
      kind: matchup.kind,
      band: matchup.band,
      heroId: matchup.heroId,
      oppId: matchup.oppId,
      seat,
      gameIndex: 0,
      result: "error",
      winner: null,
      turns: null,
      elapsedMs: null,
      seats: [
        { seat: 0, deckId: matchup.heroId, dck: matchup.heroDck, life: null, poison: null },
        { seat: 1, deckId: matchup.oppId, dck: matchup.oppDck, life: null, poison: null },
      ],
    });
  }
  return games;
}

function seatGameCounts(gamesPath: string): Map<string, [number, number]> {
  const counts = new Map<string, [number, number]>();
  if (!existsSync(gamesPath)) return counts;
  for (const line of readFileSync(gamesPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as { matchupId?: string; seat?: number };
      if (!rec.matchupId || (rec.seat !== 0 && rec.seat !== 1)) continue;
      const cur = counts.get(rec.matchupId) ?? [0, 0];
      cur[rec.seat] += 1;
      counts.set(rec.matchupId, cur);
    } catch {
      /* skip torn/partial line */
    }
  }
  return counts;
}

function completedMatchIds(matchesPath: string): Set<string> {
  const done = new Set<string>();
  if (!existsSync(matchesPath)) return done;
  for (const line of readFileSync(matchesPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as { matchupId?: string };
      if (rec.matchupId) done.add(rec.matchupId);
    } catch {
      /* skip */
    }
  }
  return done;
}

function logLine(logPath: string, line: string): void {
  const text = `[${new Date().toISOString()}] ${line}\n`;
  appendFileSync(logPath, text);
  process.stdout.write(text);
}

async function collect(plan: CollectionPlan): Promise<void> {
  const paths = forgePaths();
  const java = findJava(join(toolsRoot(), "jdk-17"));
  const jar = findForgeJar(join(toolsRoot(), "forge-2.0.14"));
  const forgeDir = join(toolsRoot(), "forge-2.0.14");
  if (!java || !jar) throw new Error("portable JDK 17 or Forge 2.0.14 missing");
  pinAiProfile();
  const done = completedMatchIds(paths.matches);
  const seatCounts = seatGameCounts(paths.games);
  let gamesLogged = 0;
  for (const [, seats] of seatCounts) gamesLogged += seats[0] + seats[1];
  const queue = plan.matchupMatrix.filter((m) => !done.has(m.id));
  const progress = {
    version: "deck-rating-forge-section64-progress-v1",
    pid: process.pid,
    startedAt: new Date().toISOString(),
    totalMatchups: plan.matchupMatrix.length,
    remaining: queue.length,
    completed: plan.nMatchups - queue.length,
    gamesLogged,
    lastMatchupId: null as string | null,
    xmx: XMX,
  };
  writeJson(paths.progress, progress);
  logLine(
    paths.log,
    `collector pid=${process.pid} remaining=${queue.length}/${plan.nMatchups} gamesLogged=${gamesLogged} xmx=${XMX} estimatedHours=${plan.estimatedHours}`,
  );

  const jvm = (decks: string[]) => [
    `-Xmx${XMX}`,
    "-Dfile.encoding=UTF-8",
    "-Dio.netty.tryReflectionSetAccessible=true",
    "-jar",
    jar,
    "sim",
    "-D",
    paths.deckDir,
    "-d",
    ...decks,
    "-f",
    "Commander",
    "-n",
    String(GAMES_PER_SEAT),
    "-q",
    "-c",
    String(CLOCK_S),
  ];

  let cursor = 0;
  const oomHits = new Map<string, number>();
  const worker = async (wid: number) => {
    while (true) {
      const i = cursor;
      cursor += 1;
      const matchup = queue[i];
      if (!matchup) return;
      const already = seatCounts.get(matchup.id) ?? [0, 0];
      const codes: Array<number | null> = [null, null];
      const newGames: GameLog[] = [];
      let oomCount = oomHits.get(matchup.id) ?? 0;
      logLine(paths.log, `w${wid} start ${matchup.id} have=${already[0]}+${already[1]}`);
      const timeoutMs = (GAMES_PER_SEAT * CLOCK_S + 180) * 1000;
      const runSeat = async (seat: 0 | 1, decks: string[]) => {
        if (already[seat] >= GAMES_PER_SEAT) {
          logLine(paths.log, `w${wid} skip-seat${seat} ${matchup.id} already ${already[seat]} games`);
          return;
        }
        if (already[seat] > 0) {
          const need = GAMES_PER_SEAT - already[seat];
          const padded = Array.from({ length: need }, (_, gi) => timeoutGame(matchup, seat, already[seat] + gi));
          for (const g of padded) appendFileSync(paths.games, `${JSON.stringify(g)}\n`);
          newGames.push(...padded);
          already[seat] += need;
          logLine(paths.log, `w${wid} pad-partial ${matchup.id} seat${seat} +${need} timeout (prior crash)`);
          return;
        }
        if (oomCount > 1) {
          const padded = Array.from({ length: GAMES_PER_SEAT }, (_, gi) => timeoutGame(matchup, seat, gi));
          for (const g of padded) appendFileSync(paths.games, `${JSON.stringify(g)}\n`);
          newGames.push(...padded);
          logLine(paths.log, `w${wid} skip-repeat-oom ${matchup.id} seat${seat} remaining timeout`);
          return;
        }
        const ran = await runJava(java, jvm(decks), forgeDir, timeoutMs);
        codes[seat] = ran.code;
        const fail = classifyJvm(ran.code, ran.out);
        if (fail.oom || fail.crash || fail.vanished) {
          oomCount += 1;
          oomHits.set(matchup.id, oomCount);
          logLine(
            paths.log,
            `w${wid} jvm-fail ${matchup.id} seat${seat} code=${ran.code} oom=${fail.oom} vanished=${fail.vanished} — recording remaining as timeout`,
          );
        }
        const parsed = parseSeatGames(ran.out, matchup, seat, { crashTimeout: fail.padTimeout });
        for (const g of parsed) appendFileSync(paths.games, `${JSON.stringify(g)}\n`);
        newGames.push(...parsed);
        already[seat] += parsed.length;
      };
      await runSeat(0, [matchup.heroDck, matchup.oppDck]);
      await runSeat(1, [matchup.oppDck, matchup.heroDck]);
      const nGames = already[0] + already[1];
      const nTimeout = newGames.filter((g) => g.result === "timeout").length;
      appendFileSync(
        paths.matches,
        `${JSON.stringify({
          matchupId: matchup.id,
          kind: matchup.kind,
          band: matchup.band,
          heroId: matchup.heroId,
          oppId: matchup.oppId,
          nGames,
          nTimeout,
          nHeroWin: newGames.filter((g) => g.result === "hero-win").length,
          finishedAt: new Date().toISOString(),
          codes,
        })}\n`,
      );
      progress.completed += 1;
      progress.remaining = plan.nMatchups - progress.completed;
      progress.gamesLogged += newGames.length;
      progress.lastMatchupId = matchup.id;
      writeJson(paths.progress, { ...progress, updatedAt: new Date().toISOString() });
      logLine(
        paths.log,
        `w${wid} done ${matchup.id} games=${nGames} new=${newGames.length} timeouts=${nTimeout} oomHits=${oomCount} completed=${progress.completed}/${plan.nMatchups}`,
      );
    }
  };

  await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)));
  logLine(paths.log, `collector finished completed=${progress.completed} games=${progress.gamesLogged}`);
}

async function main(): Promise<void> {
  const paths = forgePaths();
  mkdirSync(paths.forge, { recursive: true });
  const plan = existsSync(paths.plan) && !process.argv.includes("--rebuild-plan")
    ? (JSON.parse(readFileSync(paths.plan, "utf8")) as CollectionPlan)
    : buildSection64Plan();
  if (!existsSync(paths.plan)) writeJson(paths.plan, plan);
  console.log(
    JSON.stringify(
      {
        plan: paths.plan,
        startedAt: plan.startedAt,
        seed: plan.seed,
        nDecksPerBand: plan.nDecksPerBand,
        nMatchups: plan.nMatchups,
        nGamesPlanned: plan.nGamesPlanned,
        estimatedHours: plan.estimatedHours,
      },
      null,
      2,
    ),
  );
  if (PLAN_ONLY) return;
  if (RUN) await collect(plan);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
