import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import {
  buildSpellbookIndex,
  type CompiledVariant,
  type FrozenTemplate,
  type SpellbookIndex,
} from "../../../src/lib/deck-rating/v1/goldfish-spellbook-index-v2";
import { snapshotRoot } from "./lib";

export async function loadFrozenGoldfishIndex(snap = snapshotRoot()): Promise<SpellbookIndex> {
  const fit = join(snap, "fit");
  const tplPath = join(fit, "goldfish-spellbook-templates-v1.json");
  const varPath = join(fit, "goldfish-spellbook-variants-v2.jsonl");
  if (!existsSync(tplPath) || !existsSync(varPath)) {
    throw new Error("goldfish policy v2 artifacts missing — run freeze-goldfish-policy-v2.ts");
  }
  const tplFile = JSON.parse(readFileSync(tplPath, "utf8")) as {
    templates: Array<{
      id: number;
      name: string;
      scryfallQuery: string | null;
      n: number;
      resolver: FrozenTemplate["resolver"];
      oracleIds: string[];
      sampleNames: string[];
    }>;
  };
  const templates: FrozenTemplate[] = tplFile.templates.map((t) => ({
    id: t.id,
    name: t.name,
    scryfallQuery: t.scryfallQuery,
    oracleIds: t.oracleIds,
    names: t.sampleNames,
    n: t.n,
    resolver: t.resolver,
  }));
  const variants: CompiledVariant[] = [];
  const rl = createInterface({ input: createReadStream(varPath) });
  for await (const line of rl) {
    if (line.trim()) variants.push(JSON.parse(line) as CompiledVariant);
  }
  return buildSpellbookIndex(variants, templates);
}
