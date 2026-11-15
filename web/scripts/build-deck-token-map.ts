/**
 * Scryfall bulk → src/lib/deck-tokens/card-tokens-v1.json (card oracle id → tokens it makes).
 * Run: npx tsx scripts/build-deck-token-map.ts [--cached]
 *   --cached  use the newest bulk files already in .cache/scryfall-bulk instead of downloading
 */
import { createReadStream, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import {
  downloadBulkToCache,
  fetchBulkMetadata,
  getBulkCacheDir,
} from "../src/lib/deck-builder/golden-catalog/bulk-metadata";
import type { BulkDatasetType } from "../src/lib/deck-builder/golden-catalog/schemas";
import type { CardTokenMapEntryV1, CardTokenMapV1 } from "../src/lib/deck-tokens/deck-tokens-v1";

const OUTPUT = path.join(process.cwd(), "src", "lib", "deck-tokens", "card-tokens-v1.json");
const TOKEN_LAYOUTS = new Set(["token", "double_faced_token", "emblem"]);
const SKIP_SOURCE_LAYOUTS = new Set([...TOKEN_LAYOUTS, "art_series"]);

type ScryfallFace = {
  oracle_id?: string;
  name?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  image_uris?: { small?: string; normal?: string };
};

type ScryfallCard = ScryfallFace & {
  id: string;
  layout: string;
  digital?: boolean;
  lang?: string;
  updated_at?: string;
  card_faces?: ScryfallFace[];
  all_parts?: Array<{ id: string; component: string; name: string; type_line: string }>;
};

async function bulkPath(type: BulkDatasetType, cached: boolean): Promise<{ file: string; updatedAt: string }> {
  if (cached) {
    const dir = getBulkCacheDir();
    const newest = readdirSync(dir)
      .filter((f) => f.startsWith(`${type}-`) && f.endsWith(".jsonl.gz"))
      .sort()
      .at(-1);
    if (!newest) throw new Error(`No cached ${type} bulk in ${dir}`);
    return { file: path.join(dir, newest), updatedAt: newest.slice(type.length + 1, -".jsonl.gz".length) };
  }
  const meta = await fetchBulkMetadata(type);
  if (!meta) throw new Error(`Scryfall has no ${type} bulk`);
  console.log(`Downloading ${type} (${meta.updatedAt})…`);
  const { cachePath } = await downloadBulkToCache(meta);
  return { file: cachePath, updatedAt: meta.updatedAt };
}

async function* readCards(file: string): AsyncGenerator<ScryfallCard> {
  const input = createReadStream(file);
  const lines = createInterface({ input: file.endsWith(".gz") ? input.pipe(createGunzip()) : input });
  for await (const raw of lines) {
    const line = raw.trim().replace(/,$/, "");
    if (!line || line === "[" || line === "]") continue;
    yield JSON.parse(line) as ScryfallCard;
  }
}

function oracleIdOf(card: ScryfallCard): string | undefined {
  return card.oracle_id ?? card.card_faces?.[0]?.oracle_id;
}

function tokenEntry(card: ScryfallCard): CardTokenMapEntryV1 {
  const face = card.card_faces?.[0];
  const typeLine = card.type_line ?? face?.type_line ?? "";
  const power = card.power ?? face?.power;
  const toughness = card.toughness ?? face?.toughness;
  const text = card.oracle_text ?? card.card_faces?.map((f) => f.oracle_text ?? "").join(" // ");
  return {
    name: card.name ?? "",
    typeLine,
    kind: card.layout === "emblem" || /\bEmblem\b/.test(typeLine) ? "emblem" : "token",
    ...(power != null ? { power } : {}),
    ...(toughness != null ? { toughness } : {}),
    colors: card.colors ?? face?.colors ?? [],
    ...(text ? { text } : {}),
    ...((card.image_uris ?? face?.image_uris)?.normal
      ? { imageUrl: (card.image_uris ?? face?.image_uris)!.normal }
      : {}),
  };
}

async function main() {
  const cached = process.argv.includes("--cached");
  const defaults = await bulkPath("default_cards", cached);
  const oracle = await bulkPath("oracle_cards", cached);

  // Token printing id → token oracle id + facts. Paper printings win the image.
  const printingToToken = new Map<string, string>();
  const tokens: Record<string, CardTokenMapEntryV1> = {};
  const tokenHasPaperImage = new Set<string>();
  for await (const card of readCards(defaults.file)) {
    if (!TOKEN_LAYOUTS.has(card.layout)) continue;
    const tokenId = oracleIdOf(card);
    if (!tokenId) continue;
    printingToToken.set(card.id, tokenId);
    const paper = !card.digital && (card.lang ?? "en") === "en";
    if (!tokens[tokenId] || (paper && !tokenHasPaperImage.has(tokenId))) {
      tokens[tokenId] = tokenEntry(card);
      if (paper) tokenHasPaperImage.add(tokenId);
    }
  }
  console.log(`Token printings: ${printingToToken.size}, distinct tokens: ${Object.keys(tokens).length}`);

  const cards: Record<string, string[]> = {};
  let unresolved = 0;
  for await (const card of readCards(oracle.file)) {
    if (SKIP_SOURCE_LAYOUTS.has(card.layout)) continue;
    const oracleId = oracleIdOf(card);
    if (!oracleId) continue;
    const made = new Set<string>();
    for (const part of card.all_parts ?? []) {
      if (part.component !== "token") continue;
      const tokenId = printingToToken.get(part.id);
      if (!tokenId) {
        unresolved++;
        continue;
      }
      made.add(tokenId);
    }
    if (made.size > 0) cards[oracleId] = [...made].sort();
  }

  const used = new Set(Object.values(cards).flat());
  const usedTokens = Object.fromEntries(
    Object.entries(tokens)
      .filter(([id]) => used.has(id))
      .sort(([a], [b]) => a.localeCompare(b)),
  );

  const map: CardTokenMapV1 = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceUpdatedAt: oracle.updatedAt,
    tokens: usedTokens,
    cards: Object.fromEntries(Object.entries(cards).sort(([a], [b]) => a.localeCompare(b))),
  };
  writeFileSync(OUTPUT, `${JSON.stringify(map)}\n`, "utf8");
  console.log(
    `Wrote ${OUTPUT}: ${Object.keys(map.cards).length} cards → ${Object.keys(usedTokens).length} tokens/emblems` +
      (unresolved ? ` (${unresolved} links to unknown printings skipped)` : ""),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
