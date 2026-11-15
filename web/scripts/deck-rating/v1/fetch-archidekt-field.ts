import { createReadStream, createWriteStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip, createGzip } from "node:zlib";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { classifyCommanderBracketV1 } from "../../../src/lib/commander-bracket-rubric/v1";
import { loadComboBracketTagsV1 } from "../../../src/lib/commander-bracket-rubric/v1/combo-bracket-tags";
import { comboSummaryFromArchitecture } from "../../../src/lib/commander-bracket-rubric/v1/detectors";
import type {
  BracketRubricCard,
  BracketRubricComboSet,
  BracketRubricComboSummary,
} from "../../../src/lib/commander-bracket-rubric/v1";
import { architectureFromHits } from "../../../src/lib/commander-optimization-score/v1/architecture-from-hits";
import type { CosV1CompiledVariant } from "../../../src/lib/commander-optimization-score/v1/detect";
import { loadSpellbookComboArtifacts } from "../../../src/lib/commander-optimization-score/v1/load-artifacts";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../../../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { resolveOracleName, type OracleNameMap } from "../../../src/lib/deck-rating/v1/oracle-name-map";
import { ensureDir, fetchJson, sha256File, sleep, snapshotRoot, writeJson } from "./lib";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";

const FILTERS = {
  host: "archidekt.com",
  search: "https://archidekt.com/api/decks/v3/",
  deck: "https://archidekt.com/api/decks/{id}/",
  format: 3,
  updatedSinceDays: 365,
  minResolvedUnique: 95,
  measuredFloors: [3, 4],
  nearCopyJaccard: 0.9,
  b5OverlapJaccard: 0.6,
  maxPerCommander: 5,
  targetPerField: 400,
  fieldCap: 800,
  searchPageSize: 50,
  searchPageCap: 40,
  candidateOrderings: ["-updatedAt", "-viewCount", "-createdAt"],
  searchSortOrder: {
    applied: ["-updatedAt", "-viewCount", "-createdAt"],
    note: "Union of three Archidekt orderings; first-seen wins. Primary listing is -updatedAt, then -viewCount, then -createdAt.",
  },
  archidektBracketPrior: [3, 4],
  declaredB3MeasuresAtMost: 3,
  dropPrivate: true,
  dropUnlisted: true,
  dropTheorycrafted: true,
  legalNow: "mainboard + commander + companion only; maybeboard/sideboard/considering/wishlist ignored; tokens dropped; banned or not_legal on remaining cards fails",
  excludeCategories: ["maybeboard", "sideboard", "considering", "wishlist", "maybe", "acquire", "want", "tokens", "token"],
};

type SearchHit = {
  id: number;
  name?: string;
  size?: number;
  updatedAt?: string;
  deckFormat?: number;
  edhBracket?: number | null;
  private?: boolean;
  unlisted?: boolean;
  theorycrafted?: boolean;
};

type FieldRow = {
  archidektId: number;
  name: string;
  url: string;
  updatedAt: string;
  commanders: string[];
  commanderKey: string;
  resolvedUnique: number;
  measured: 2 | 3 | 4;
  measuredRaw?: 2 | 3 | 4;
  archidektEdhBracket: number | null;
  oracleIds: string[];
};

export async function fetchArchidektField(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const outDir = ensureDir(join(snap, "archidekt"));
  writeJson(join(outDir, "filters.json"), FILTERS);

  const cutoff = Date.now() - FILTERS.updatedSinceDays * 86400000;
  const oracle = await loadSnapshotOracleNameMap(snap);
  const b5 = await loadB5Index(snap);
  const gcSet = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  const { comboIndex, compiled } = await loadSpellbookComboArtifacts();
  const tags = loadComboBracketTagsV1();
  const byFirst = invertCompiled(compiled);

  const hits = await collectSearchHits(cutoff);
  writeJson(join(outDir, "search-index.json"), {
    n: hits.length,
    ids: hits.map((h) => h.id),
  });
  console.log(`archidekt search hits ${hits.length}`);

  const kept: FieldRow[] = [];
  const funnel = {
    searchHits: hits.length,
    fetched: 0,
    failFetch: 0,
    tooOld: 0,
    tooSmall: 0,
    illegal: 0,
    illegalBannedMain: 0,
    illegalNotLegalMain: 0,
    droppedMaybeboardCards: 0,
    droppedTokenCards: 0,
    below95: 0,
    measuredOther: 0,
    declaredB3KeptAsB3: 0,
    nearCopy: 0,
    b5Overlap: 0,
    commanderCap: 0,
    kept: 0,
  };
  const perCommander = new Map<string, number>();

  for (const hit of hits) {
    const n3 = kept.filter((r) => r.measured === 3).length;
    const n4 = kept.filter((r) => r.measured === 4).length;
    if (n3 >= FILTERS.fieldCap && n4 >= FILTERS.fieldCap) break;
    if (n3 >= FILTERS.targetPerField && n4 >= FILTERS.targetPerField && funnel.fetched > hits.length * 0.35) {
      break;
    }
    const rawPath = join(outDir, "raw", `${hit.id}.json`);
    let json: Record<string, unknown> | null = null;
    if (existsSync(rawPath)) {
      json = JSON.parse(readFileSync(rawPath, "utf8")) as Record<string, unknown>;
    } else {
      await sleep(250);
      const full = await fetchJson<Record<string, unknown>>(`https://archidekt.com/api/decks/${hit.id}/`);
      if (full.status !== 200 || !full.json) {
        funnel.failFetch += 1;
        continue;
      }
      json = full.json;
      writeJson(rawPath, json);
    }
    funnel.fetched += 1;
    const parsed = parseArchidektDeck(json, oracle);
    if (!parsed) {
      funnel.tooSmall += 1;
      continue;
    }
    const updatedAt = String(json.updatedAt ?? hit.updatedAt ?? "");
    if (updatedAt && Date.parse(updatedAt) < cutoff) {
      funnel.tooOld += 1;
      continue;
    }
    funnel.droppedMaybeboardCards += parsed.droppedMaybeboard;
    funnel.droppedTokenCards += parsed.droppedTokens;
    if (parsed.illegalReason) {
      funnel.illegal += 1;
      if (parsed.illegalReason === "banned") funnel.illegalBannedMain += 1;
      else funnel.illegalNotLegalMain += 1;
      continue;
    }
    if (parsed.oracleIds.length < FILTERS.minResolvedUnique) {
      funnel.below95 += 1;
      continue;
    }
    const measured = classifyList(parsed.cards, gcSet, byFirst, comboIndex, tags);
    const declared = typeof hit.edhBracket === "number" ? hit.edhBracket : null;
    const field = fieldBucket(measured, declared);
    if (!field) {
      funnel.measuredOther += 1;
      continue;
    }
    if (declared === 3 && measured <= 3 && field === 3) funnel.declaredB3KeptAsB3 += 1;
    if (field === 3 && kept.filter((r) => r.measured === 3).length >= FILTERS.fieldCap) continue;
    if (field === 4 && kept.filter((r) => r.measured === 4).length >= FILTERS.fieldCap) continue;
    if (nearCopy(parsed.oracleIds, kept, FILTERS.nearCopyJaccard)) {
      funnel.nearCopy += 1;
      continue;
    }
    if (b5.n && overlapsB5(parsed.oracleIds, b5, FILTERS.b5OverlapJaccard)) {
      funnel.b5Overlap += 1;
      continue;
    }
    const commanderKey = parsed.commanders.slice().sort().join("|") || "unknown";
    const nForCmd = perCommander.get(commanderKey) ?? 0;
    if (nForCmd >= FILTERS.maxPerCommander) {
      funnel.commanderCap += 1;
      continue;
    }
    perCommander.set(commanderKey, nForCmd + 1);
    kept.push({
      archidektId: hit.id,
      name: String(json.name ?? hit.name ?? hit.id),
      url: `https://archidekt.com/decks/${hit.id}`,
      updatedAt,
      commanders: parsed.commanders,
      commanderKey,
      resolvedUnique: parsed.oracleIds.length,
      measured: field,
      measuredRaw: measured,
      archidektEdhBracket: declared,
      oracleIds: parsed.oracleIds,
    });
    funnel.kept += 1;
    if (funnel.kept % 25 === 0) {
      console.log(`archidekt kept ${funnel.kept} (b3=${kept.filter((r) => r.measured === 3).length} b4=${kept.filter((r) => r.measured === 4).length} fetched ${funnel.fetched})`);
      writeJson(join(outDir, "progress.json"), { funnel, kept: kept.length });
    }
  }

  const b3 = kept.filter((r) => r.measured === 3);
  const b4 = kept.filter((r) => r.measured === 4);
  writeJson(join(outDir, "field-b3.json"), slim(b3));
  writeJson(join(outDir, "field-b4.json"), slim(b4));
  await writeIdentityJsonl(join(outDir, "field-b3.jsonl.gz"), b3);
  await writeIdentityJsonl(join(outDir, "field-b4.jsonl.gz"), b4);
  const summary = {
    filters: FILTERS,
    funnel,
    fieldCounts: { b3: b3.length, b4: b4.length },
    targetMet: {
      b3: b3.length >= FILTERS.targetPerField,
      b4: b4.length >= FILTERS.targetPerField,
    },
    hashes: {
      b3: sha256File(join(outDir, "field-b3.json")),
      b4: sha256File(join(outDir, "field-b4.json")),
      b3Identities: sha256File(join(outDir, "field-b3.jsonl.gz")),
      b4Identities: sha256File(join(outDir, "field-b4.jsonl.gz")),
    },
    b5Screen: { identitySets: b5.n, jaccard: FILTERS.b5OverlapJaccard },
  };
  writeJson(join(outDir, "summary.json"), summary);
  return summary;
}

function slim(rows: FieldRow[]) {
  return rows.map(({ oracleIds: _ids, ...rest }) => ({
    ...rest,
    identitySha256: require("node:crypto").createHash("sha256").update(rest.commanderKey + "|" + _ids.join(",")).digest("hex"),
  }));
}

async function writeIdentityJsonl(path: string, rows: FieldRow[]): Promise<void> {
  const gzip = createGzip();
  const out = createWriteStream(path);
  const done = pipeline(gzip, out);
  for (const row of rows) gzip.write(`${JSON.stringify(row)}\n`);
  gzip.end();
  await done;
}

async function collectSearchHits(cutoff: number): Promise<SearchHit[]> {
  const byId = new Map<number, SearchHit>();
  for (const bracket of FILTERS.archidektBracketPrior) {
    for (const orderBy of FILTERS.candidateOrderings) {
      for (let page = 1; page <= FILTERS.searchPageCap; page += 1) {
        const url =
          `https://archidekt.com/api/decks/v3/?deckFormat=${FILTERS.format}` +
          `&edhBracket=${bracket}&orderBy=${encodeURIComponent(orderBy)}` +
          `&pageSize=${FILTERS.searchPageSize}&page=${page}`;
        const res = await fetchJson<{ results?: SearchHit[]; next?: string | null }>(url);
        const rows = res.json?.results ?? [];
        if (!rows.length) break;
        for (const row of rows) {
          if (FILTERS.dropPrivate && row.private) continue;
          if (FILTERS.dropUnlisted && row.unlisted) continue;
          if (FILTERS.dropTheorycrafted && row.theorycrafted) continue;
          if ((row.size ?? 0) < FILTERS.minResolvedUnique) continue;
          if (row.updatedAt && Date.parse(row.updatedAt) < cutoff) continue;
          if (row.deckFormat != null && row.deckFormat !== FILTERS.format) continue;
          byId.set(row.id, row);
        }
        if (!res.json?.next) break;
        await sleep(200);
      }
    }
  }
  const all = [...byId.values()];
  const b3 = all.filter((h) => h.edhBracket === 3);
  const b4 = all.filter((h) => h.edhBracket === 4);
  const other = all.filter((h) => h.edhBracket !== 3 && h.edhBracket !== 4);
  const zipped: SearchHit[] = [];
  const n = Math.max(b3.length, b4.length);
  for (let i = 0; i < n; i += 1) {
    if (b4[i]) zipped.push(b4[i]!);
    if (b3[i]) zipped.push(b3[i]!);
  }
  return [...zipped, ...other];
}

function excludedCategory(cats: string[]): boolean {
  return cats.some((c) => {
    const x = c.toLowerCase();
    return (
      FILTERS.excludeCategories.includes(x) ||
      x.startsWith("maybe-") ||
      x.startsWith("maybeboard") ||
      x.startsWith("sideboard")
    );
  });
}

function resolveName(oracle: OracleNameMap, name: string, hinted: string): string | null {
  if (hinted && oracle.byId.has(hinted)) return hinted;
  return resolveOracleName(oracle, name)?.oracleId ?? null;
}

function parseArchidektDeck(
  raw: Record<string, unknown>,
  oracle: OracleNameMap,
): {
  commanders: string[];
  cards: BracketRubricCard[];
  oracleIds: string[];
  illegalReason: "banned" | "not_legal" | null;
  droppedMaybeboard: number;
  droppedTokens: number;
} | null {
  const cardsRaw = (raw.cards as Array<Record<string, unknown>> | undefined) ?? [];
  if (!cardsRaw.length) return null;
  const commanders: string[] = [];
  const cards: BracketRubricCard[] = [];
  const ids = new Set<string>();
  let illegalReason: "banned" | "not_legal" | null = null;
  let droppedMaybeboard = 0;
  let droppedTokens = 0;
  for (const rec of cardsRaw) {
    const card = (rec.card as Record<string, unknown> | undefined) ?? {};
    const oc = (card.oracleCard as Record<string, unknown> | undefined) ?? {};
    const name = String(oc.name ?? card.displayName ?? card.name ?? "").trim();
    const qty = Number(rec.quantity ?? 1) || 1;
    const cats = ((rec.categories as string[]) ?? []).map((c) => String(c).toLowerCase());
    if (excludedCategory(cats) && !cats.includes("commander") && !cats.includes("companion")) {
      droppedMaybeboard += 1;
      continue;
    }
    const isCommander = cats.includes("commander");
    const hinted = String(oc.uid ?? oc.oracleId ?? card.uid ?? "").trim();
    const resolvedId = resolveName(oracle, name, hinted);
    if (!resolvedId) continue;
    const info = oracle.byId.get(resolvedId);
    if (!info) continue;
    const tokenish = /\b(token|emblem|sticker)\b/i.test(info.typeLine) || cats.includes("tokens") || cats.includes("token");
    if (tokenish && info.commanderLegal !== "legal") {
      droppedTokens += 1;
      continue;
    }
    if (info.commanderLegal === "banned") illegalReason = illegalReason ?? "banned";
    else if (info.commanderLegal !== "legal") illegalReason = illegalReason ?? "not_legal";
    ids.add(resolvedId);
    if (isCommander) commanders.push(info.name);
    cards.push({
      oracleId: resolvedId,
      name: info.name,
      typeLine: info.typeLine,
      oracleText: info.text,
      quantity: qty,
      isCommander,
    });
  }
  return {
    commanders,
    cards,
    oracleIds: [...ids].sort(),
    illegalReason,
    droppedMaybeboard,
    droppedTokens,
  };
}

function fieldBucket(measured: 2 | 3 | 4, declared: number | null): 3 | 4 | null {
  if (declared === 3 && measured <= 3) return 3;
  if (measured === 3) return 3;
  if (measured === 4) return 4;
  return null;
}


function classifyList(
  cards: BracketRubricCard[],
  gcSet: Set<string>,
  byFirst: Map<string, CosV1CompiledVariant[]>,
  comboIndex: Awaited<ReturnType<typeof loadSpellbookComboArtifacts>>["comboIndex"],
  tags: ReturnType<typeof loadComboBracketTagsV1>,
): 2 | 3 | 4 {
  const present = new Set(cards.map((c) => c.oracleId));
  const commanderOracleIds = new Set(cards.filter((c) => c.isCommander).map((c) => c.oracleId));
  const hits: Array<{ cardSetSignature: string; commanderInvolved: boolean }> = [];
  const seen = new Set<string>();
  for (const oracleId of present) {
    for (const variant of byFirst.get(oracleId) ?? []) {
      if (seen.has(variant.cardSetSignature)) continue;
      if (variant.requiredOracleIds.some((id) => !present.has(id))) continue;
      seen.add(variant.cardSetSignature);
      hits.push({
        cardSetSignature: variant.cardSetSignature,
        commanderInvolved:
          variant.requiredOracleIds.some((id) => commanderOracleIds.has(id)) ||
          (variant.mustBeCommanderOracleIds ?? []).some((id) => present.has(id)),
      });
    }
  }
  const architecture = architectureFromHits(hits, comboIndex, hits.length);
  const summary = comboSummaryFromArchitecture(architecture);
  const nameByOracleId = new Map(cards.map((c) => [c.oracleId, c.name] as const));
  const comboSets: BracketRubricComboSet[] = [];
  for (const hit of hits) {
    const row = comboIndex.get(hit.cardSetSignature);
    if (!row) continue;
    const tagRow = tags.get(hit.cardSetSignature);
    comboSets.push({
      cardCount: row.comboCardCount,
      cards: hit.cardSetSignature
        .split("|")
        .filter(Boolean)
        .map((oracleId) => ({ oracleId, name: nameByOracleId.get(oracleId) ?? oracleId })),
      winsOnResolution: row.isTerminalRoute,
      bracketTag: tagRow?.tag ?? null,
      requiresUnsatisfiedTemplate: (tagRow?.nTemplates ?? row.nTemplates ?? 0) > 0,
    });
  }
  const live = comboSets.filter((set) => !set.requiresUnsatisfiedTemplate);
  const combos: BracketRubricComboSummary = {
    ...summary,
    twoCardCombos: live.filter((s) => s.cardCount === 2).length,
    totalCombos: live.length,
    comboSets,
  };
  const assigned = classifyCommanderBracketV1({ cards, gameChangerOracleIds: gcSet, combos }).assignedBracket;
  if (assigned === 1 || assigned === 2) return 2;
  if (assigned === 3) return 3;
  return 4;
}

function invertCompiled(compiled: CosV1CompiledVariant[]): Map<string, CosV1CompiledVariant[]> {
  const index = new Map<string, CosV1CompiledVariant[]>();
  for (const variant of compiled) {
    const key = variant.requiredOracleIds[0];
    if (!key) continue;
    const list = index.get(key);
    if (list) list.push(variant);
    else index.set(key, [variant]);
  }
  return index;
}

function jaccard(a: string[], b: Set<string>): number {
  let inter = 0;
  for (const id of a) if (b.has(id)) inter += 1;
  const union = a.length + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function nearCopy(ids: string[], kept: FieldRow[], threshold: number): boolean {
  const set = new Set(ids);
  return kept.some((row) => jaccard(row.oracleIds, set) >= threshold);
}

function overlapsB5(
  ids: string[],
  b5: { n: number; sets: string[][]; byCard: Map<string, number[]> },
  threshold: number,
): boolean {
  const scores = new Map<number, number>();
  for (const id of ids) {
    for (const idx of b5.byCard.get(id) ?? []) scores.set(idx, (scores.get(idx) ?? 0) + 1);
  }
  for (const [idx, inter] of scores) {
    const other = b5.sets[idx]!;
    const union = ids.length + other.length - inter;
    if (union > 0 && inter / union >= threshold) return true;
  }
  return false;
}

async function loadB5Index(snap: string): Promise<{ n: number; sets: string[][]; byCard: Map<string, number[]> }> {
  const path = join(snap, "b5", "b5-identity-sets.jsonl.gz");
  const sets: string[][] = [];
  const byCard = new Map<string, number[]>();
  if (!existsSync(path)) return { n: 0, sets, byCard };
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as { oracleIds?: string[] };
    const ids = rec.oracleIds ?? [];
    const idx = sets.length;
    sets.push(ids);
    for (const id of ids) {
      const list = byCard.get(id);
      if (list) list.push(idx);
      else byCard.set(id, [idx]);
    }
  }
  return { n: sets.length, sets, byCard };
}

if (require.main === module) {
  fetchArchidektField()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

