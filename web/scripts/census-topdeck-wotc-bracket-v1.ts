/**
 * Phase 0 census: WotC-correct rubric over every TopDeck normalized-v3 list.
 *
 * Writes aggregate counts only. Raw lists stay in topdeckImportRuns.
 *
 * Run: cd web && npx tsx scripts/census-topdeck-wotc-bracket-v1.ts
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
import type { BracketRubricCard, BracketRubricComboSet, BracketRubricComboSummary } from "../src/lib/commander-bracket-rubric/v1";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import type { NormalizedDeckInstance, TopdeckPodGame } from "../src/lib/commander-strategy/types";

const TOPDECK_ROOT = "data/milestones/topdeck/topdeckImportRuns";
const RC8_PATH = "data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2.jsonl.gz";
const OUT_PATH = "data/milestones/deck-evaluation/phase0-wotc-bracket-census-v1.json";
const MIN_RESOLVED_CARDS = Number(process.env.MIN_RESOLVED_CARDS ?? 60);

type OracleRow = { name: string; text: string; typeLine: string };

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

function v3Runs(): Array<{ dir: string; decks: string; pods: string }> {
  const root = resolve(process.cwd(), TOPDECK_ROOT);
  const out: Array<{ dir: string; decks: string; pods: string }> = [];
  for (const dir of readdirSync(root)) {
    const decks = join(root, dir, "normalized-decks-v3.json");
    const pods = join(root, dir, "normalized-pods-v3.json");
    if (existsSync(decks) && existsSync(pods)) out.push({ dir, decks, pods });
  }
  return out.sort((a, b) => a.dir.localeCompare(b.dir));
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
    const nTemplates = tagRow?.nTemplates ?? row.nTemplates ?? 0;
    comboSets.push({
      cardCount: row.comboCardCount,
      cards: hit.cardSetSignature
        .split("|")
        .filter(Boolean)
        .map((oracleId) => ({ oracleId, name: nameByOracleId.get(oracleId) ?? oracleId })),
      winsOnResolution: row.isTerminalRoute,
      bracketTag: tagRow?.tag ?? null,
      requiresUnsatisfiedTemplate: nTemplates > 0,
    });
  }
  const live = comboSets.filter((set) => !set.requiresUnsatisfiedTemplate);
  return {
    ...summary,
    twoCardCombos: live.filter((set) => set.cardCount === 2).length,
    totalCombos: live.length,
    comboSets,
  };
}

function cardsForDeck(
  deck: NormalizedDeckInstance,
  oracleIndex: Map<string, OracleRow>,
): BracketRubricCard[] {
  const commanderIds = new Set(deck.commanderOracleIds.filter(Boolean));
  const cards: BracketRubricCard[] = [];
  for (const oracleId of commanderIds) {
    const hit = oracleIndex.get(oracleId);
    if (!hit) continue;
    cards.push({
      oracleId,
      name: hit.name,
      typeLine: hit.typeLine,
      oracleText: hit.text,
      quantity: 1,
      isCommander: true,
    });
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

function bump(map: Map<number | string, number>, key: number | string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

async function main(): Promise<void> {
  const started = Date.now();
  const runs = v3Runs();
  if (runs.length === 0) throw new Error("no TopDeck normalized-v3 runs found");

  console.log("loading oracle index…");
  const oracleIndex = await loadOracleIndex();
  const snapshot = loadCommanderGameChangerSnapshot();
  const gcSet = gameChangerOracleIdSet(snapshot);
  console.log(`${oracleIndex.size} cards indexed, ${gcSet.size} Game Changers`);

  console.log("loading Spellbook artifacts…");
  const { comboIndex, compiled } = await loadSpellbookComboArtifacts();
  const tags = loadComboBracketTagsV1();
  const byFirst = invertCompiled(compiled);
  console.log(`${compiled.length} compiled variants, ${tags.size} tag rows, ${runs.length} v3 runs\n`);

  const bracketByDeckId = new Map<string, number>();
  const seenDeckIds = new Set<string>();
  const seenPodIds = new Set<string>();
  type HashMemo = {
    bracket: number;
    gameChangers: number;
    liveCombo: boolean;
    ruthless: boolean;
    spicyOrPowerful: boolean;
    signals: string[];
    determining: string[];
  };
  const hashCache = new Map<string, HashMemo | "unresolved">();

  const deckBrackets = new Map<number, number>();
  const signalPresence = new Map<string, number>();
  const determining = new Map<string, number>();
  let scored = 0;
  let skippedUnresolved = 0;
  let uniqueDecks = 0;
  let cacheHits = 0;
  let totalGameChangers = 0;
  let decksWithLiveCombo = 0;
  let decksWithRuthless = 0;
  let decksWithSpicyOrPowerful = 0;

  const applyMemo = (deckInstanceId: string, memo: HashMemo): void => {
    bracketByDeckId.set(deckInstanceId, memo.bracket);
    scored += 1;
    bump(deckBrackets, memo.bracket);
    for (const id of memo.signals) bump(signalPresence, id);
    for (const id of memo.determining) bump(determining, id);
    totalGameChangers += memo.gameChangers;
    if (memo.liveCombo) decksWithLiveCombo += 1;
    if (memo.ruthless) decksWithRuthless += 1;
    if (memo.spicyOrPowerful) decksWithSpicyOrPowerful += 1;
  };

  for (const run of runs) {
    console.log(`reading decks ${run.dir}`);
    const decks = JSON.parse(readFileSync(run.decks, "utf8")) as NormalizedDeckInstance[];

    for (const deck of decks) {
      if (seenDeckIds.has(deck.deckInstanceId)) continue;
      seenDeckIds.add(deck.deckInstanceId);
      uniqueDecks += 1;

      const cached = hashCache.get(deck.deckHash);
      if (cached === "unresolved") {
        skippedUnresolved += 1;
        continue;
      }
      if (cached) {
        cacheHits += 1;
        applyMemo(deck.deckInstanceId, cached);
        continue;
      }

      const cards = cardsForDeck(deck, oracleIndex);
      if (cards.length < MIN_RESOLVED_CARDS) {
        hashCache.set(deck.deckHash, "unresolved");
        skippedUnresolved += 1;
        continue;
      }

      const commanderOracleIds = new Set(cards.filter((c) => c.isCommander).map((c) => c.oracleId));
      const present = new Set(cards.map((c) => c.oracleId));
      const hits = detectHits(present, commanderOracleIds, byFirst);
      const combos = summaryFromHits({ cards, hits, comboIndex, tags });
      const result = classifyCommanderBracketV1({ cards, gameChangerOracleIds: gcSet, combos });
      const live = (combos.comboSets ?? []).filter((set) => !set.requiresUnsatisfiedTemplate);
      const memo: HashMemo = {
        bracket: result.assignedBracket,
        gameChangers: result.signals.find((s) => s.id === "game_changers")?.count ?? 0,
        liveCombo: live.length > 0,
        ruthless: live.some((set) => set.bracketTag === "R"),
        spicyOrPowerful: live.some((set) => set.bracketTag === "S" || set.bracketTag === "P"),
        signals: result.signals.filter((s) => s.count > 0).map((s) => s.id),
        determining: result.determiningSignals.map((s) => s.id),
      };
      hashCache.set(deck.deckHash, memo);
      applyMemo(deck.deckInstanceId, memo);

      if (scored % 2000 === 0) {
        const elapsed = ((Date.now() - started) / 1000).toFixed(0);
        console.log(`  scored ${scored} lists in ${elapsed}s (cache ${cacheHits})`);
      }
    }
  }

  let pods = 0;
  let podsSize4 = 0;
  let podsSize4AllLists = 0;
  let podsSize4AllScored = 0;
  let podsSize4CompletedWinner = 0;
  let podsSize4AllScoredCompletedWinner = 0;

  for (const run of runs) {
    console.log(`reading pods ${run.dir}`);
    const podGames = JSON.parse(readFileSync(run.pods, "utf8")) as TopdeckPodGame[];
    for (const pod of podGames) {
      if (seenPodIds.has(pod.podId)) continue;
      seenPodIds.add(pod.podId);
      pods += 1;
      if (pod.participants.length !== 4) continue;
      podsSize4 += 1;
      const seatsPresent = pod.participants.filter((p) => seenDeckIds.has(p.deckInstanceId)).length;
      const seatsScored = pod.participants.filter((p) => bracketByDeckId.has(p.deckInstanceId)).length;
      if (seatsPresent === 4) podsSize4AllLists += 1;
      if (seatsScored === 4) podsSize4AllScored += 1;
      const completedWinner =
        pod.status === "Completed" &&
        !pod.draw &&
        Boolean(pod.winnerPlayerIdHash || pod.participants.some((p) => p.winner));
      if (completedWinner) podsSize4CompletedWinner += 1;
      if (completedWinner && seatsScored === 4) podsSize4AllScoredCompletedWinner += 1;
    }
  }

  const pct = (n: number, d: number) => (d > 0 ? Number(((n / d) * 100).toFixed(2)) : 0);
  const payload = {
    version: "phase0-wotc-bracket-census-v1",
    generatedAt: new Date().toISOString(),
    rubricVersion: "commander-bracket-rubric-v1.1",
    gameChangerListVersion: snapshot.gameChangerListVersion,
    gameChangerCount: gcSet.size,
    runs: runs.map((r) => r.dir),
    decks: {
      uniqueDecks,
      uniqueHashes: [...hashCache.values()].filter((v) => v !== "unresolved").length,
      scored,
      skippedUnresolved,
      hashCacheHits: cacheHits,
      brackets: {
        2: deckBrackets.get(2) ?? 0,
        3: deckBrackets.get(3) ?? 0,
        4: deckBrackets.get(4) ?? 0,
      },
      bracketPct: {
        2: pct(deckBrackets.get(2) ?? 0, scored),
        3: pct(deckBrackets.get(3) ?? 0, scored),
        4: pct(deckBrackets.get(4) ?? 0, scored),
      },
      meanGameChangers: scored > 0 ? Number((totalGameChangers / scored).toFixed(3)) : 0,
      decksWithLiveCombo,
      decksWithRuthless,
      decksWithSpicyOrPowerful,
      signalPresence: Object.fromEntries([...signalPresence.entries()].sort((a, b) => b[1] - a[1])),
      determiningSignals: Object.fromEntries([...determining.entries()].sort((a, b) => b[1] - a[1])),
    },
    pods: {
      uniquePods: pods,
      size4: podsSize4,
      size4AllListsPresent: podsSize4AllLists,
      size4AllListsPresentPct: pct(podsSize4AllLists, podsSize4),
      size4AllScored: podsSize4AllScored,
      size4AllScoredPct: pct(podsSize4AllScored, podsSize4),
      size4CompletedWinner: podsSize4CompletedWinner,
      size4AllScoredCompletedWinner: podsSize4AllScoredCompletedWinner,
    },
    elapsedMs: Date.now() - started,
  };

  const out = resolve(process.cwd(), OUT_PATH);
  mkdirSync(resolve(out, ".."), { recursive: true });
  writeFileSync(out, JSON.stringify(payload, null, 2));

  console.log(`\n=== Deck brackets (${scored} scored / ${uniqueDecks} unique)`);
  for (const b of [2, 3, 4] as const) {
    console.log(`  B${b}: ${(payload.decks.brackets[b] ?? 0).toString().padStart(7)}  ${payload.decks.bracketPct[b]}%`);
  }
  console.log(`\n=== Size-4 pods`);
  console.log(`  ${podsSize4} size-4`);
  console.log(`  ${podsSize4AllLists} with all 4 lists present (${payload.pods.size4AllListsPresentPct}%)`);
  console.log(`  ${podsSize4AllScored} with all 4 lists scored (${payload.pods.size4AllScoredPct}%)`);
  console.log(`\nwrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
