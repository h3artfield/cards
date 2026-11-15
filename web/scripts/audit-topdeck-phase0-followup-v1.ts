/**
 * Phase 0 follow-up: unresolved-list breakdown, 95-card bar, event tags,
 * B5 field, and the DR fit-population slice. Aggregates only.
 *
 * Run: cd web && npx tsx scripts/audit-topdeck-phase0-followup-v1.ts
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join, resolve } from "node:path";
import { architectureFromHits } from "../src/lib/commander-optimization-score/v1/architecture-from-hits";
import type { CosV1CompiledVariant } from "../src/lib/commander-optimization-score/v1/detect";
import { loadSpellbookComboArtifacts } from "../src/lib/commander-optimization-score/v1/load-artifacts";
import { classifyCommanderBracketV1 } from "../src/lib/commander-bracket-rubric/v1";
import { loadComboBracketTagsV1 } from "../src/lib/commander-bracket-rubric/v1/combo-bracket-tags";
import { comboSummaryFromArchitecture } from "../src/lib/commander-bracket-rubric/v1/detectors";
import { fieldBracketV1, tagEventFromTitleV1, type EventFieldTagV1 } from "../src/lib/commander-bracket-rubric/v1/event-tag-v1";
import type { BracketRubricCard, BracketRubricComboSet, BracketRubricComboSummary } from "../src/lib/commander-bracket-rubric/v1";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import type { NormalizedDeckInstance, TopdeckPodGame } from "../src/lib/commander-strategy/types";

const TOPDECK_ROOT = "data/milestones/topdeck/topdeckImportRuns";
const RC8_PATH = "data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2.jsonl.gz";
const OUT_PATH = "data/milestones/deck-evaluation/phase0-followup-audit-v1.json";
const BAR_LOOSE = 60;
const BAR_STRICT = 95;

type OracleRow = { name: string; text: string; typeLine: string };
type SkipReason = "no_list" | "commander_only" | "stub_list" | "name_match" | "catalog_gap" | "thin_resolved";

function bump(map: Map<string | number, number>, key: string | number, n = 1): void {
  map.set(key, (map.get(key) ?? 0) + n);
}

async function loadOracleIndex(): Promise<Map<string, OracleRow>> {
  const byOracleId = new Map<string, OracleRow>();
  const rl = createInterface({
    input: createReadStream(resolve(process.cwd(), RC8_PATH)).pipe(createGunzip()),
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as {
      oracleId?: string;
      canonicalName?: string;
      typeLine?: string;
      semantic?: { abilities?: Array<{ abilitySpan?: { text?: string } }> };
    };
    if (!rec.oracleId) continue;
    byOracleId.set(rec.oracleId, {
      name: rec.canonicalName ?? rec.oracleId,
      typeLine: rec.typeLine ?? "",
      text: (rec.semantic?.abilities ?? []).map((a) => a.abilitySpan?.text ?? "").filter(Boolean).join(" "),
    });
  }
  return byOracleId;
}

function runDirs(): string[] {
  return readdirSync(resolve(process.cwd(), TOPDECK_ROOT)).sort();
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

function detectHits(
  present: Set<string>,
  commanderOracleIds: Set<string>,
  byFirst: Map<string, CosV1CompiledVariant[]>,
): Array<{ cardSetSignature: string; commanderInvolved: boolean }> {
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
  return hits;
}

function summaryFromHits(args: {
  cards: BracketRubricCard[];
  hits: Array<{ cardSetSignature: string; commanderInvolved: boolean }>;
  comboIndex: Awaited<ReturnType<typeof loadSpellbookComboArtifacts>>["comboIndex"];
  tags: ReturnType<typeof loadComboBracketTagsV1>;
}): BracketRubricComboSummary {
  const architecture = architectureFromHits(args.hits, args.comboIndex, args.hits.length);
  const summary = comboSummaryFromArchitecture(architecture);
  const nameByOracleId = new Map(args.cards.map((card) => [card.oracleId, card.name] as const));
  const comboSets: BracketRubricComboSet[] = [];
  const seen = new Set<string>();
  for (const hit of args.hits) {
    if (seen.has(hit.cardSetSignature)) continue;
    seen.add(hit.cardSetSignature);
    const row = args.comboIndex.get(hit.cardSetSignature);
    if (!row) continue;
    const tagRow = args.tags.get(hit.cardSetSignature);
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
  return { ...summary, twoCardCombos: live.filter((s) => s.cardCount === 2).length, totalCombos: live.length, comboSets };
}

function cardsForDeck(deck: NormalizedDeckInstance, oracleIndex: Map<string, OracleRow>): BracketRubricCard[] {
  const commanderIds = new Set(deck.commanderOracleIds.filter(Boolean));
  const cards: BracketRubricCard[] = [];
  for (const oracleId of commanderIds) {
    const hit = oracleIndex.get(oracleId);
    if (!hit) continue;
    cards.push({ oracleId, name: hit.name, typeLine: hit.typeLine, oracleText: hit.text, quantity: 1, isCommander: true });
  }
  for (const row of deck.mainboard) {
    if (!row.oracleId || commanderIds.has(row.oracleId)) continue;
    const hit = oracleIndex.get(row.oracleId);
    if (!hit) continue;
    cards.push({
      oracleId: row.oracleId,
      name: hit.name,
      typeLine: hit.typeLine,
      oracleText: hit.text,
      quantity: row.quantity ?? 1,
      isCommander: false,
    });
  }
  return cards;
}

function skipReason(deck: NormalizedDeckInstance, rc8Count: number): SkipReason {
  const named = deck.mainboard.length;
  const resolved = deck.mainboard.filter((c) => c.resolutionStatus === "resolved" && c.oracleId).length;
  const unresolved = deck.unresolvedCards.length + deck.mainboard.filter((c) => c.resolutionStatus === "unresolved").length;
  if (!deck.decklistAvailable && !deck.deckObjAvailable && named === 0) return "no_list";
  if (named === 0) return "commander_only";
  if (named < 20) return "stub_list";
  if (unresolved >= 10 || named - resolved >= 10) return "name_match";
  if (resolved >= BAR_LOOSE && rc8Count < BAR_LOOSE) return "catalog_gap";
  return "thin_resolved";
}

function looksFixableName(name: string): boolean {
  return /\/\/|é|á|í|ó|ú|ñ|ü|ö|ä|ß|the\s|of\s|,|\b\(/.test(name) || /universes|secret lair|ub /i.test(name);
}

async function main(): Promise<void> {
  const started = Date.now();
  const dirs = runDirs();
  const v3 = dirs.filter((dir) => existsSync(join(resolve(process.cwd(), TOPDECK_ROOT), dir, "normalized-decks-v3.json")));
  const other = dirs.filter((dir) => !v3.includes(dir)).map((dir) => {
    const root = join(resolve(process.cwd(), TOPDECK_ROOT), dir);
    const files = existsSync(root) ? readdirSync(root) : [];
    const manifestPath = join(root, "run-manifest.json");
    const manifest = existsSync(manifestPath)
      ? (JSON.parse(readFileSync(manifestPath, "utf8")) as { status?: string; tournamentCount?: number; rawDigest?: string })
      : null;
    return { dir, files, tournamentCount: manifest?.tournamentCount ?? null, rawDigest: manifest?.rawDigest ?? null };
  });

  const titleByTid = new Map<string, string>();
  for (const dir of v3) {
    const statsPath = join(resolve(process.cwd(), TOPDECK_ROOT), dir, "aggregate-stats.json");
    if (!existsSync(statsPath)) continue;
    const stats = JSON.parse(readFileSync(statsPath, "utf8")) as {
      tournamentMeta?: Array<{ tid?: string; name?: string }>;
    };
    for (const row of stats.tournamentMeta ?? []) {
      if (row.tid && row.name && !titleByTid.has(row.tid)) titleByTid.set(row.tid, row.name);
    }
  }

  console.log("loading oracle + spellbook…");
  const oracleIndex = await loadOracleIndex();
  const gcSet = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  const { comboIndex, compiled } = await loadSpellbookComboArtifacts();
  const tags = loadComboBracketTagsV1();
  const byFirst = invertCompiled(compiled);

  const seenDeckIds = new Set<string>();
  const seenPodIds = new Set<string>();
  const unresolvedNameCounts = new Map<string, number>();
  const skipCounts = new Map<SkipReason, number>();
  const skipFixable = new Map<SkipReason, number>();
  let uniqueDecks = 0;
  let skippedLoose = 0;

  type Memo = { measured: 2 | 3 | 4; rc8: number; tid: string; month: string };
  const hashCache = new Map<string, Memo | "skip">();
  const byDeckId = new Map<string, Memo>();

  const bracketsLoose = new Map<number, number>();
  const bracketsStrict = new Map<number, number>();
  const fieldStrict = new Map<number, number>();
  const b2b3Loose = { lowRes: 0, full: 0, byEvent: new Map<string, number>() };
  const eventKindDecks = new Map<string, number>();
  const eventKindEvents = new Map<string, number>();
  const labeledAgree = { n: 0, agree: 0, byDeclared: new Map<string, { n: number; agree: number }> };
  const seenTids = new Set<string>();

  const tagForTid = (tid: string): EventFieldTagV1 => tagEventFromTitleV1(titleByTid.get(tid));

  for (const dir of v3) {
    console.log(`decks ${dir}`);
    const decks = JSON.parse(
      readFileSync(join(resolve(process.cwd(), TOPDECK_ROOT), dir, "normalized-decks-v3.json"), "utf8"),
    ) as NormalizedDeckInstance[];
    for (const deck of decks) {
      if (seenDeckIds.has(deck.deckInstanceId)) continue;
      seenDeckIds.add(deck.deckInstanceId);
      uniqueDecks += 1;
      if (deck.tid && !seenTids.has(deck.tid)) {
        seenTids.add(deck.tid);
        bump(eventKindEvents, tagForTid(deck.tid).kind);
      }

      const record = (memo: Memo): void => {
        byDeckId.set(deck.deckInstanceId, memo);
        bump(bracketsLoose, memo.measured);
        const tag = tagForTid(memo.tid);
        if (memo.measured <= 3) {
          if (memo.rc8 < BAR_STRICT) b2b3Loose.lowRes += 1;
          else {
            b2b3Loose.full += 1;
            bump(b2b3Loose.byEvent, tag.kind);
          }
        }
        if (memo.rc8 >= BAR_STRICT) {
          bump(bracketsStrict, memo.measured);
          bump(fieldStrict, fieldBracketV1({ measured: memo.measured, tag }));
          bump(eventKindDecks, tag.kind);
          if (tag.kind === "bracket_labeled" && tag.declaredBracket) {
            const key = String(tag.declaredBracket);
            const row = labeledAgree.byDeclared.get(key) ?? { n: 0, agree: 0 };
            row.n += 1;
            labeledAgree.n += 1;
            if (memo.measured === tag.declaredBracket) {
              row.agree += 1;
              labeledAgree.agree += 1;
            }
            labeledAgree.byDeclared.set(key, row);
          }
        }
      };

      const cached = hashCache.get(deck.deckHash);
      if (cached === "skip") {
        skippedLoose += 1;
        bump(skipCounts, skipReason(deck, 0));
        continue;
      }
      if (cached) {
        record(cached);
        continue;
      }

      for (const name of deck.unresolvedCards) bump(unresolvedNameCounts, name);
      for (const row of deck.mainboard) {
        if (row.resolutionStatus === "unresolved") bump(unresolvedNameCounts, row.sourceName || row.normalizedName);
      }

      const cards = cardsForDeck(deck, oracleIndex);
      if (cards.length < BAR_LOOSE) {
        const reason = skipReason(deck, cards.length);
        bump(skipCounts, reason);
        if (reason === "name_match" || reason === "catalog_gap") bump(skipFixable, reason);
        hashCache.set(deck.deckHash, "skip");
        skippedLoose += 1;
        continue;
      }

      const commanderOracleIds = new Set(cards.filter((c) => c.isCommander).map((c) => c.oracleId));
      const hits = detectHits(new Set(cards.map((c) => c.oracleId)), commanderOracleIds, byFirst);
      const combos = summaryFromHits({ cards, hits, comboIndex, tags });
      const result = classifyCommanderBracketV1({ cards, gameChangerOracleIds: gcSet, combos });
      const measured = result.assignedBracket as 2 | 3 | 4;
      const month = deck.canonicalMonth ?? (deck.tournamentDate || "").slice(0, 7);
      const memo: Memo = { measured, rc8: cards.length, tid: deck.tid, month };
      hashCache.set(deck.deckHash, memo);
      record(memo);
    }
  }

  let pods = 0;
  let size4 = 0;
  let size4AllScoredLoose = 0;
  let size4AllScoredStrict = 0;
  let size4AllScoredStrictWinner = 0;
  let size4AllScoredStrictDraw = 0;
  let size4AllScoredStrictNoOutcome = 0;
  const monthsStrict = new Map<string, { pods: number; draws: number }>();
  const sampleSeats: Array<{
    podId: string;
    month: string;
    outcome: "winner" | "draw" | "none";
    seats: Array<{ seat: number; playerIdHash: string; deckInstanceId: string; measured: number }>;
  }> = [];

  for (const dir of v3) {
    console.log(`pods ${dir}`);
    const podsFile = JSON.parse(
      readFileSync(join(resolve(process.cwd(), TOPDECK_ROOT), dir, "normalized-pods-v3.json"), "utf8"),
    ) as TopdeckPodGame[];
    for (const pod of podsFile) {
      if (seenPodIds.has(pod.podId)) continue;
      seenPodIds.add(pod.podId);
      pods += 1;
      if (pod.participants.length !== 4) continue;
      size4 += 1;
      const memos = pod.participants.map((p) => byDeckId.get(p.deckInstanceId));
      if (memos.every((m) => m && m.rc8 >= BAR_LOOSE)) size4AllScoredLoose += 1;
      if (!memos.every((m) => m && m.rc8 >= BAR_STRICT)) continue;
      size4AllScoredStrict += 1;
      const draw = Boolean(pod.draw) || (!pod.winnerPlayerIdHash && !pod.participants.some((p) => p.winner));
      const winner = Boolean(pod.winnerPlayerIdHash || pod.participants.some((p) => p.winner));
      const outcome = winner && !pod.draw ? "winner" : draw ? "draw" : "none";
      if (outcome === "winner") size4AllScoredStrictWinner += 1;
      else if (outcome === "draw") size4AllScoredStrictDraw += 1;
      else size4AllScoredStrictNoOutcome += 1;
      const month = pod.canonicalMonth ?? (pod.tournamentDate || "").slice(0, 7);
      const monthRow = monthsStrict.get(month) ?? { pods: 0, draws: 0 };
      monthRow.pods += 1;
      if (outcome === "draw") monthRow.draws += 1;
      monthsStrict.set(month, monthRow);
      if (sampleSeats.length < 3) {
        sampleSeats.push({
          podId: pod.podId,
          month,
          outcome,
          seats: pod.participants.map((p, seat) => ({
            seat,
            playerIdHash: p.playerIdHash,
            deckInstanceId: p.deckInstanceId,
            measured: memos[seat]!.measured,
          })),
        });
      }
    }
  }

  const topUnresolved = [...unresolvedNameCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([name, count]) => ({ name, count, looksFixable: looksFixableName(name) }));

  const months = [...monthsStrict.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const newest = months.at(-1)?.[0] ?? null;
  const testPods = newest ? monthsStrict.get(newest)?.pods ?? 0 : 0;
  const trainPods = months.reduce((n, [month, row]) => n + (month === newest ? 0 : row.pods), 0);

  const payload = {
    version: "phase0-followup-audit-v1",
    generatedAt: new Date().toISOString(),
    runs: {
      totalDirs: dirs.length,
      v3,
      other,
      note:
        "The 12 v3 runs are the monthly corpus. The other four are a dry-run (0 tournaments) and three aborted raw fetches — they do not need v3 normalization.",
    },
    unresolved: {
      uniqueDecks,
      skippedBelow60: skippedLoose,
      byReason: Object.fromEntries(skipCounts),
      fixableBuckets: Object.fromEntries(skipFixable),
      top50UnresolvedNames: topUnresolved,
    },
    scoringBar: {
      loose: BAR_LOOSE,
      strict: BAR_STRICT,
      bracketsAt60: Object.fromEntries(bracketsLoose),
      bracketsAt95: Object.fromEntries(bracketsStrict),
      fieldAt95: Object.fromEntries(fieldStrict),
      b2b3At60: {
        lowResolution: b2b3Loose.lowRes,
        fullLists: b2b3Loose.full,
        fullListsByEventKind: Object.fromEntries(b2b3Loose.byEvent),
      },
    },
    events: {
      uniqueTids: seenTids.size,
      titled: titleByTid.size,
      byKind: Object.fromEntries(eventKindEvents),
      scoredAt95ByKind: Object.fromEntries(eventKindDecks),
      bracketLabeledAgreement: {
        n: labeledAgree.n,
        agree: labeledAgree.agree,
        pct: labeledAgree.n ? Number(((labeledAgree.agree / labeledAgree.n) * 100).toFixed(1)) : 0,
        byDeclared: Object.fromEntries(labeledAgree.byDeclared),
      },
    },
    fitPopulation: {
      uniquePods: pods,
      size4,
      size4AllScoredAt60: size4AllScoredLoose,
      size4AllScoredAt95: size4AllScoredStrict,
      winners: size4AllScoredStrictWinner,
      draws: size4AllScoredStrictDraw,
      noOutcome: size4AllScoredStrictNoOutcome,
      seatsKept: "participant index + playerIdHash + deckInstanceId",
      byMonth: Object.fromEntries(months.map(([month, row]) => [month, row])),
      timeSplit: { trainMonths: months.map(([m]) => m).filter((m) => m !== newest), testMonth: newest, trainPods, testPods },
      sampleSeats,
      band: "5xxx only. Do not reuse these weights for B2–B4 until casual outcome data exists.",
    },
    elapsedMs: Date.now() - started,
  };

  const out = resolve(process.cwd(), OUT_PATH);
  mkdirSync(resolve(out, ".."), { recursive: true });
  writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({
    unresolved: payload.unresolved.byReason,
    skipped: skippedLoose,
    bracketsAt95: payload.scoringBar.bracketsAt95,
    fieldAt95: payload.scoringBar.fieldAt95,
    b2b3: payload.scoringBar.b2b3At60,
    events: payload.events.byKind,
    labeled: payload.events.bracketLabeledAgreement,
    fit: {
      at95: size4AllScoredStrict,
      winners: size4AllScoredStrictWinner,
      draws: size4AllScoredStrictDraw,
      testMonth: newest,
      testPods,
    },
    otherRuns: other,
  }, null, 2));
  console.log(`\nwrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
