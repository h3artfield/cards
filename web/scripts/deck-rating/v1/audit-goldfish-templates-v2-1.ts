#!/usr/bin/env npx tsx
/**
 * Template audit for goldfish policy v2.1. Local freeze + local oracle IDs only.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { snapshotRoot, writeJson } from "./lib";
import {
  completeVariantsForDeck,
  type CompiledVariant,
  type FrozenTemplate,
} from "../../../src/lib/deck-rating/v1/goldfish-spellbook-index-v2";
import { loadFrozenGoldfishIndex } from "./load-goldfish-policy-index";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";

const ISOCHRON = "Isochron Scepter";
const DRAMATIC = "Dramatic Reversal";
const ROCKS = ["Sol Ring", "Arcane Signet", "Mana Vault"];

async function main() {
  const snap = snapshotRoot();
  const fit = join(snap, "fit");
  const tplPath = join(fit, "goldfish-spellbook-templates-v1.json");
  const varPath = join(fit, "goldfish-spellbook-variants-v2.jsonl");
  if (!existsSync(tplPath) || !existsSync(varPath)) throw new Error("freeze missing");

  const tplFile = JSON.parse(readFileSync(tplPath, "utf8")) as {
    nTemplates: number;
    templates: Array<{
      id: number;
      name: string;
      scryfallQuery: string | null;
      n: number;
      resolver: string;
      oracleIds: string[];
      sampleNames: string[];
    }>;
  };

  const nTemplates = tplFile.templates.length;
  const nonempty = tplFile.templates.filter((t) => t.n > 0);
  const empty = tplFile.templates.filter((t) => t.n === 0);
  const byResolver: Record<string, number> = {};
  for (const t of tplFile.templates) byResolver[t.resolver] = (byResolver[t.resolver] ?? 0) + 1;

  let variants = 0;
  let variantsWithTemplates = 0;
  let terminalWithTemplates = 0;
  let isoRevHits = 0;
  const isoRev: CompiledVariant[] = [];
  const rl = createInterface({ input: createReadStream(varPath) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const v = JSON.parse(line) as CompiledVariant;
    variants += 1;
    if (v.templateIds.length) {
      variantsWithTemplates += 1;
      if (v.terminal) terminalWithTemplates += 1;
    }
    const names = new Set(v.uses.map((u) => u.name));
    if (names.has(ISOCHRON) && names.has(DRAMATIC)) {
      isoRevHits += 1;
      isoRev.push(v);
    }
  }

  const oracle = await loadSnapshotOracleNameMap(snap);
  const namesWanted = [ISOCHRON, DRAMATIC, ...ROCKS];
  const ids: Record<string, string> = {};
  for (const [id, c] of oracle.byId) {
    if (namesWanted.includes(c.name) && !ids[c.name]) ids[c.name] = id;
  }
  const deckIds = new Set(Object.values(ids));
  const index = await loadFrozenGoldfishIndex(snap);
  const hits = completeVariantsForDeck(index, deckIds);
  const scepterHits = hits.filter((h) => {
    const names = new Set(h.variant.uses.map((u) => u.name));
    return names.has(ISOCHRON) && names.has(DRAMATIC);
  });

  const spot = {
    deckOracleIds: ids,
    nHits: scepterHits.length,
    anyWithTemplates: scepterHits.some((h) => h.withTemplates),
    anyStrict: scepterHits.some((h) => h.strict),
    sample: scepterHits.slice(0, 8).map((h) => ({
      id: h.variant.id,
      templateIds: h.variant.templateIds,
      strict: h.strict,
      withTemplates: h.withTemplates,
      terminal: h.variant.terminal,
      tokens: h.variant.tokens.map((t) => t.kind),
    })),
  };

  const report = {
    version: "goldfish-template-audit-v2-1",
    nTemplates,
    nNonEmptyOracleSets: nonempty.length,
    nEmptyOracleSets: empty.length,
    byResolver,
    variants,
    variantsWithTemplates,
    terminalWithTemplates,
    isoRevCompiled: isoRevHits,
    isoRevTemplateIds: [...new Set(isoRev.flatMap((v) => v.templateIds))],
    isochronSpotTest: spot,
    isochronSpotPass: spot.anyWithTemplates,
    emptySample: empty.slice(0, 40).map((t) => ({
      id: t.id,
      name: t.name,
      resolver: t.resolver,
      scryfallQuery: t.scryfallQuery,
    })),
  };
  writeJson(join(fit, "goldfish-template-audit-v2-1.json"), report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
