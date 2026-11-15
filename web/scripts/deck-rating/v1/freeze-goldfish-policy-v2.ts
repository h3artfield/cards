#!/usr/bin/env npx tsx
/**
 * Freeze Spellbook templates against the LOCAL snapshot oracle (type/text/otag).
 * Compile token-producing variants. No live Scryfall.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join } from "node:path";
import { newestMatching, repoWebRoot, snapshotRoot, writeJson } from "./lib";
import {
  cardMatchesTemplate,
  type LocalOracleCard,
} from "../../../src/lib/deck-rating/v1/goldfish-template-match-v2";
import { compileVariant, type FrozenTemplate } from "../../../src/lib/deck-rating/v1/goldfish-spellbook-index-v2";
import { AUTHORED_CONVERTERS } from "../../../src/lib/deck-rating/v1/goldfish-resource-graph-v2";
import { FEATURE_TOKEN_REVIEW } from "../../../src/lib/deck-rating/v1/goldfish-feature-tokens-v2";
import { OPPONENT_MODEL_NOTES } from "../../../src/lib/deck-rating/v1/goldfish-opponents-v2";
import { writeFileSync } from "node:fs";

async function* readJsonlGz<T>(path: string): AsyncGenerator<T> {
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line) as T;
  }
}

async function* readJsonl<T>(path: string): AsyncGenerator<T> {
  const rl = createInterface({ input: createReadStream(path) });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line) as T;
  }
}

function parsePower(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export async function freezeGoldfishPolicyV2(): Promise<Record<string, unknown>> {
  const started = Date.now();
  const snap = snapshotRoot();
  const fit = join(snap, "fit");
  const web = repoWebRoot();
  const mirror = join(web, "data/milestones/mechanical-space/commanderspellbook-full-mirror-v1");
  const oraclePath = newestMatching(join(snap, "scryfall"), /^oracle-cards-.*\.jsonl\.gz$/);
  const otagPath = newestMatching(join(snap, "scryfall"), /^oracle-tags-.*\.jsonl\.gz$/);
  if (!oraclePath) throw new Error("local oracle-cards dump missing");
  if (!otagPath) throw new Error("local oracle-tags dump missing");
  if (!existsSync(join(mirror, "templates.json"))) throw new Error("spellbook templates.json missing");
  if (!existsSync(join(mirror, "variants.jsonl"))) throw new Error("spellbook variants.jsonl missing");

  const otags = new Map<string, Set<string>>();
  for await (const rec of readJsonlGz<{
    type?: string;
    slug?: string;
    taggings?: Array<{ oracle_id?: string; weight?: string }>;
  }>(otagPath)) {
    if (rec.type !== "oracle" || !rec.slug) continue;
    const slug = rec.slug.toLowerCase();
    for (const t of rec.taggings ?? []) {
      const id = t.oracle_id?.trim();
      if (!id || t.weight === "weak") continue;
      const set = otags.get(id) ?? new Set();
      set.add(slug);
      otags.set(id, set);
    }
  }

  const cards: LocalOracleCard[] = [];
  for await (const rec of readJsonlGz<{
    oracle_id?: string;
    name?: string;
    type_line?: string;
    oracle_text?: string;
    mana_cost?: string;
    cmc?: number;
    power?: string | number | null;
    toughness?: string | number | null;
    colors?: string[];
    keywords?: string[];
    layout?: string;
    legalities?: { commander?: string };
  }>(oraclePath)) {
    if (!rec.oracle_id || !rec.name) continue;
    if (/\b(token|emblem|art series|memorabilia|sticker)\b/i.test(rec.type_line ?? "")) continue;
    cards.push({
      oracleId: rec.oracle_id,
      name: rec.name,
      typeLine: rec.type_line ?? "",
      text: rec.oracle_text ?? "",
      manaCost: rec.mana_cost ?? "",
      cmc: Number(rec.cmc ?? 0),
      power: parsePower(rec.power),
      toughness: parsePower(rec.toughness),
      colors: rec.colors ?? [],
      keywords: rec.keywords ?? [],
      layout: rec.layout ?? "",
      commanderLegal: rec.legalities?.commander ?? "unknown",
      otags: otags.get(rec.oracle_id) ?? new Set(),
    });
  }

  const rawTemplates = JSON.parse(readFileSync(join(mirror, "templates.json"), "utf8")) as Array<{
    id: number;
    name: string;
    scryfallQuery: string | null;
  }>;
  const templates: FrozenTemplate[] = [];
  for (const t of rawTemplates) {
    const hits = cards.filter((c) => cardMatchesTemplate(c, t));
    templates.push({
      id: t.id,
      name: t.name,
      scryfallQuery: t.scryfallQuery,
      oracleIds: hits.map((c) => c.oracleId),
      names: hits.slice(0, 40).map((c) => c.name),
      n: hits.length,
      resolver: t.scryfallQuery ? "local-oracle-query" : hits.length ? "local-heuristic" : "empty",
    });
    console.log(`template ${t.id} ${t.name}: ${hits.length}`);
  }

  const variants = [];
  let rawN = 0;
  let compiledN = 0;
  let terminalN = 0;
  for await (const raw of readJsonl<Parameters<typeof compileVariant>[0]>(join(mirror, "variants.jsonl"))) {
    rawN += 1;
    const v = compileVariant(raw);
    if (!v) continue;
    compiledN += 1;
    if (v.terminal) terminalN += 1;
    variants.push(v);
  }

  const templatesPath = join(fit, "goldfish-spellbook-templates-v1.json");
  writeJson(templatesPath, {
    version: "goldfish-spellbook-templates-v1",
    source: "commanderspellbook-full-mirror-v1 + snapshot oracle/otags 2026-09-25",
    liveScryfall: false,
    nTemplates: templates.length,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      scryfallQuery: t.scryfallQuery,
      n: t.n,
      resolver: t.resolver,
      oracleIds: t.oracleIds,
      sampleNames: t.names,
    })),
  });

  const variantsPath = join(fit, "goldfish-spellbook-variants-v2.jsonl");
  writeFileSync(variantsPath, variants.map((v) => JSON.stringify(v)).join("\n") + "\n");

  const graphPath = join(fit, "goldfish-resource-graph-v1.json");
  writeJson(graphPath, {
    version: "goldfish-resource-graph-v1",
    opponentModel: OPPONENT_MODEL_NOTES,
    featureTokens: FEATURE_TOKEN_REVIEW,
    converters: AUTHORED_CONVERTERS,
    templates: templates.map((t) => ({ id: t.id, name: t.name, n: t.n, resolver: t.resolver, sampleNames: t.names })),
    variantCount: compiledN,
    terminalVariantCount: terminalN,
    rawVariantCount: rawN,
    variantsPath: "goldfish-spellbook-variants-v2.jsonl",
    sourceMirror: "web/data/milestones/mechanical-space/commanderspellbook-full-mirror-v1",
    elapsedMs: Date.now() - started,
  });

  return {
    templatesPath,
    graphPath,
    variantsPath,
    nTemplates: templates.length,
    compiledN,
    terminalN,
    elapsedMs: Date.now() - started,
  };
}

if (require.main === module) {
  freezeGoldfishPolicyV2()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
