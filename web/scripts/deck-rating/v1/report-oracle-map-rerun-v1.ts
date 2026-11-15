#!/usr/bin/env npx tsx
/**
 * Before → after for the shared Commander-legal-face oracle name map.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join } from "node:path";
import { resolveOracleName } from "../../../src/lib/deck-rating/v1/oracle-name-map";
import { snapshotRoot, writeJson } from "./lib";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";

export async function reportOracleMapRerunV1(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const before = existsSync(join(snap, "fit", "oracle-map-rerun-before-v1.json"))
    ? (JSON.parse(readFileSync(join(snap, "fit", "oracle-map-rerun-before-v1.json"), "utf8")) as Record<string, unknown>)
    : {};
  const oracle = await loadSnapshotOracleNameMap(snap);
  const tower = resolveOracleName(oracle, "Command Tower");
  const labels = JSON.parse(readFileSync(join(snap, "labels", "precon-labels.json"), "utf8")) as {
    ranked: number;
    joined: number;
    unmatched?: unknown[];
    decks: Array<{
      last3Years?: boolean;
      commanders: Array<{ name?: string; oracleId?: string | null }>;
      mainboard: Array<{ name?: string; oracleId?: string | null }>;
    }>;
  };
  const tagIds = new Set<string>();
  const tagPath = join(snap, "tags", "deck-rating-tag-table-v1.1.jsonl.gz");
  if (existsSync(tagPath)) {
    const rl = createInterface({ input: createReadStream(tagPath).pipe(createGunzip()) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as { oracle_id?: string; oracleId?: string };
      const id = rec.oracle_id ?? rec.oracleId;
      if (id) tagIds.add(id);
    }
  }
  let preconCards = 0;
  let nameResolvesOwnId = 0;
  let nameResolvesLegal = 0;
  let nameResolvesCardFace = 0;
  let tagJoinByName = 0;
  let tagJoinByStoredId = 0;
  let b2 = 0;
  for (const deck of labels.decks) {
    if (deck.last3Years) b2 += 1;
    for (const card of [...deck.commanders, ...deck.mainboard]) {
      if (!card.oracleId || !card.name) continue;
      preconCards += 1;
      const hit = resolveOracleName(oracle, card.name);
      if (hit?.oracleId === card.oracleId) nameResolvesOwnId += 1;
      if (hit?.commanderLegal === "legal" || hit?.commanderLegal === "banned") nameResolvesLegal += 1;
      if (hit && /^card(\s|\/\/|$)/i.test(hit.typeLine)) nameResolvesCardFace += 1;
      if (hit && tagIds.has(hit.oracleId)) tagJoinByName += 1;
      if (tagIds.has(card.oracleId)) tagJoinByStoredId += 1;
    }
  }

  const mox = existsSync(join(snap, "playgroup", "public-decks", "moxfield-from-playgroup", "usable-moxfield-v1.json"))
    ? (JSON.parse(readFileSync(join(snap, "playgroup", "public-decks", "moxfield-from-playgroup", "usable-moxfield-v1.json"), "utf8")) as {
        funnel?: Record<string, number>;
        n?: { usable?: number };
        usable?: unknown[];
      })
    : {};
  const archUsable = existsSync(join(snap, "playgroup", "public-decks", "usable-archidekt-v1.json"))
    ? (JSON.parse(readFileSync(join(snap, "playgroup", "public-decks", "usable-archidekt-v1.json"), "utf8")) as {
        n?: { usableArchidektLists?: number };
      })
    : {};
  const progress = existsSync(join(snap, "archidekt", "progress.json"))
    ? (JSON.parse(readFileSync(join(snap, "archidekt", "progress.json"), "utf8")) as { funnel?: Record<string, number> })
    : {};
  const summary = existsSync(join(snap, "archidekt", "summary.json"))
    ? (JSON.parse(readFileSync(join(snap, "archidekt", "summary.json"), "utf8")) as {
        funnel?: Record<string, number>;
        fieldCounts?: { b3?: number; b4?: number };
      })
    : {};
  const phase0 = existsSync(join(process.cwd(), "data/milestones/deck-evaluation/phase0-followup-audit-v1.json"))
    ? (JSON.parse(readFileSync(join(process.cwd(), "data/milestones/deck-evaluation/phase0-followup-audit-v1.json"), "utf8")) as {
        scoringBar?: { bracketsAt60?: Record<string, number>; bracketsAt95?: Record<string, number> };
        unresolved?: { uniqueDecks?: number; skippedBelow60?: number };
      })
    : {};

  const liveHits = Number(progress.funnel?.searchHits ?? 0);
  const frozenHits = Number(summary.funnel?.searchHits ?? 0);
  const archInFlight = liveHits > 0 && (liveHits !== frozenHits || Number(progress.funnel?.fetched ?? 0) < liveHits * 0.99);
  const archFunnel = archInFlight
    ? { ...(progress.funnel ?? {}), status: "in-progress" }
    : {
        ...(summary.funnel ?? progress.funnel ?? {}),
        fieldB3: summary.fieldCounts?.b3 ?? 0,
        fieldB4: summary.fieldCounts?.b4 ?? 0,
        status: "complete",
      };

  const report = {
    version: "deck-rating-oracle-map-rerun-after-v1",
    commandTower: {
      oracleId: tower?.oracleId ?? null,
      typeLine: tower?.typeLine ?? null,
      commanderLegal: tower?.commanderLegal ?? null,
      isReprintPair: tower ? /^card(\s|\/\/|$)/i.test(tower.typeLine) : null,
    },
    phase0: {
      resolvesBy: "stored TopDeck oracle ids, not the Scryfall name map",
      unchanged: true,
      uniqueDecks: phase0.unresolved?.uniqueDecks ?? null,
      scoredAt60: phase0.unresolved?.uniqueDecks != null && phase0.unresolved?.skippedBelow60 != null
        ? phase0.unresolved.uniqueDecks - phase0.unresolved.skippedBelow60
        : null,
      skippedUnresolved: phase0.unresolved?.skippedBelow60 ?? null,
      bracketsAt60: phase0.scoringBar?.bracketsAt60 ?? null,
      bracketsAt95: phase0.scoringBar?.bracketsAt95 ?? null,
    },
    archidekt: {
      before: (before as { archidekt?: unknown }).archidekt ?? null,
      after: archFunnel,
    },
    precons: {
      ranked: labels.ranked,
      joinedPlaygroupToMtgjson: labels.joined,
      unmatched: labels.unmatched?.length ?? 0,
      b2Last3Years: b2,
      nameMap: {
        cards: preconCards,
        resolvesOwnOracleId: nameResolvesOwnId,
        commanderLegalOrBanned: nameResolvesLegal,
        reprintPairFaces: nameResolvesCardFace,
      },
    },
    tagTableJoins: {
      tableCards: tagIds.size,
      preconByStoredId: tagJoinByStoredId,
      preconByResolvedName: tagJoinByName,
      note: "Tag table is keyed by oracle_id; name-map only affects name→id joins.",
    },
    playgroupImportedLists: {
      before: (before as { playgroupImportedMoxfield?: unknown }).playgroupImportedMoxfield ?? null,
      after: {
        usableArchidektNamed90: archUsable.n?.usableArchidektLists ?? null,
        moxfield: mox.n ?? { usable: mox.usable?.length ?? null },
      },
    },
  };
  writeJson(join(snap, "fit", "oracle-map-rerun-after-v1.json"), report);
  return report;
}

if (require.main === module) {
  reportOracleMapRerunV1()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
