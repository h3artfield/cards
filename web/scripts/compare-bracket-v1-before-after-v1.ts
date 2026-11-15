/**
 * Old v1.0 floors vs WotC v1.1 on the lists that were mismeasured.
 *
 * Old: any extra turn → 3, any two-card combo → 4, any combo → 3,
 * three unrestricted tutors → 3. New: tutors off, unchained extra turns off,
 * Spellbook tags, templates ignored.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyCommanderBracketV1 } from "../src/lib/commander-bracket-rubric/v1";
import { comboSummaryForDeck } from "../src/lib/commander-bracket-rubric/v1/combos-server";
import type { BracketRubricCard, BracketRubricComboSummary } from "../src/lib/commander-bracket-rubric/v1";
import {
  countLoopableExtraTurns,
  detectExtraTurnCards,
  detectUnrestrictedTutors,
} from "../src/lib/commander-bracket-rubric/v1/detectors";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";

const FYNN = [
  "Fynn, the Fangbearer",
  "Ambush Viper", "Arbor Elf", "Beast Whisperer", "Birds of Paradise", "Deadly Recluse",
  "Elvish Mystic", "Eternal Witness", "Evolution Sage", "Fang of Shigeki", "Fyndhorn Elves",
  "Haywire Mite", "Llanowar Elves", "Mirkwood Spider", "Moss Viper", "Narnam Cobra",
  "Narnam Renegade", "Ohran Frostfang", "Ohran Viper", "Questing Beast", "Sedge Scorpion",
  "Skullwinder", "Tajuru Blightblade", "Thornweald Archer", "Timeless Witness",
  "Toski, Bearer of Secrets", "Toxic Scorpion", "Wasteland Viper",
  "Beast Within", "Chord of Calling", "Force of Vigor", "Heroic Intervention", "Krosan Grip",
  "Nature's Claim", "Return of the Wildspeaker", "Return to Nature", "Snakeskin Veil",
  "Tamiyo's Safekeeping", "Tyvar's Stand", "Veil of Summer", "Worldly Tutor",
  "Cultivate", "Finale of Devastation", "Green Sun's Zenith", "Nature's Lore",
  "Overwhelming Stampede", "Regrowth", "Three Visits", "Triumph of the Hordes",
  "Chrome Mox", "Grafted Exoskeleton", "Key to the City", "Skullclamp",
  "Trailblazer's Boots", "Whispersilk Cloak",
  "Beastmaster Ascension", "Canopy Cover", "Garruk's Uprising", "Guardian Project",
  "Kenrith's Transformation", "Rancor", "Song of the Dryads", "Sylvan Library",
  "Utopia Sprawl", "Wild Growth",
  "Ancient Tomb", "Boseiju, Who Endures", "Dryad Arbor", "Fabled Passage", "Forest",
  "Gaea's Cradle", "Karn's Bastion", "Misty Rainforest", "Nykthos, Shrine to Nyx",
  "Pendelhaven", "Prismatic Vista", "Rogue's Passage", "Verdant Catacombs",
  "Windswept Heath", "Wooded Foothills", "Yavimaya, Cradle of Growth",
];

const ARTIFACTS = [
  { name: "Fynn, the Fangbearer (shipped)", names: FYNN, commander: "Fynn, the Fangbearer" },
  { name: "Chatterfang speed test", file: ".chatterfang-speed-test-result2.json" },
  { name: "Omnath after fix", file: ".omnath-after-fix.json" },
  { name: "Kodama speed test", file: ".kodama-speed-test-result3.json" },
];

function classifyOld(cards: BracketRubricCard[], combos: BracketRubricComboSummary, gcSet: Set<string>): number {
  const gc = cards.filter((c) => gcSet.has(c.oracleId)).length;
  let floor = 2;
  if (gc > 0) floor = Math.max(floor, gc > 3 ? 4 : 3);
  if (detectExtraTurnCards(cards).length > 0) floor = Math.max(floor, 3);
  if (countLoopableExtraTurns(cards) >= 3) floor = Math.max(floor, 4);
  if ((combos.comboSets ?? []).some((s) => s.cardCount === 2 && !s.requiresUnsatisfiedTemplate) || combos.twoCardCombos > 0) {
    floor = Math.max(floor, 4);
  }
  if ((combos.comboSets ?? []).some((s) => !s.requiresUnsatisfiedTemplate) || combos.totalCombos > 0) {
    floor = Math.max(floor, 3);
  }
  if (detectUnrestrictedTutors(cards).length >= 3) floor = Math.max(floor, 3);
  return floor;
}

type Named = { name?: string; copies?: number; oracleId?: string | null };

function namesFromArtifact(path: string): { commander: string; names: string[] } | null {
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    result?: { constructedDeck?: { commander?: { name?: string }; lands?: Named[]; nonlands?: Named[] } };
  };
  const deck = raw.result?.constructedDeck;
  if (!deck?.commander?.name) return null;
  const names = [
    deck.commander.name,
    ...(deck.nonlands ?? []).flatMap((c) => Array.from({ length: c.copies ?? 1 }, () => c.name ?? "").filter(Boolean)),
    ...(deck.lands ?? []).flatMap((c) => Array.from({ length: c.copies ?? 1 }, () => c.name ?? "").filter(Boolean)),
  ];
  return { commander: deck.commander.name, names };
}

async function resolveCards(names: string[], commander: string): Promise<BracketRubricCard[]> {
  const { createReadStream } = await import("node:fs");
  const { createGunzip } = await import("node:zlib");
  const { createInterface } = await import("node:readline");
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const byName = new Map<string, { oracleId: string; name: string; text: string; typeLine: string }>();
  const rl = createInterface({
    input: createReadStream(resolve(process.cwd(), "data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2.jsonl.gz")).pipe(createGunzip()),
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as {
      oracleId?: string;
      canonicalName?: string;
      typeLine?: string;
      semantic?: { abilities?: Array<{ abilitySpan?: { text?: string } }> };
    };
    if (!rec.oracleId || !rec.canonicalName) continue;
    byName.set(norm(rec.canonicalName), {
      oracleId: rec.oracleId,
      name: rec.canonicalName,
      typeLine: rec.typeLine ?? "",
      text: (rec.semantic?.abilities ?? []).map((a) => a.abilitySpan?.text ?? "").filter(Boolean).join(" "),
    });
  }
  const counts = new Map<string, number>();
  for (const name of names) counts.set(norm(name), (counts.get(norm(name)) ?? 0) + 1);
  const cards: BracketRubricCard[] = [];
  for (const [key, quantity] of counts) {
    const hit = byName.get(key);
    if (!hit) continue;
    cards.push({
      oracleId: hit.oracleId,
      name: hit.name,
      typeLine: hit.typeLine,
      oracleText: hit.text,
      quantity,
      isCommander: norm(commander) === key,
    });
  }
  return cards;
}

async function main(): Promise<void> {
  const gcSet = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  const rows: Array<Record<string, unknown>> = [];

  for (const entry of ARTIFACTS) {
    let commander = entry.commander ?? "";
    let names = entry.names ?? [];
    if (entry.file) {
      const loaded = namesFromArtifact(resolve(process.cwd(), entry.file));
      if (!loaded) {
        console.log(`${entry.name}: artifact missing, skip`);
        continue;
      }
      commander = loaded.commander;
      names = loaded.names;
    }
    const cards = await resolveCards(names, commander);
    const combos = await comboSummaryForDeck({ cards });
    const next = classifyCommanderBracketV1({ cards, gameChangerOracleIds: gcSet, combos });
    const prev = classifyOld(cards, combos, gcSet);
    const gcs = next.signals.find((s) => s.id === "game_changers");
    rows.push({
      name: entry.name,
      commander,
      resolved: cards.length,
      before: prev,
      after: next.assignedBracket,
      determining: next.determiningSignals.map((s) => `${s.id}:${s.count}`),
      gameChangers: gcs?.evidence.map((e) => e.name) ?? [],
      notes: next.notes.slice(0, 2),
    });
    console.log(
      `${entry.name}: B${prev} → B${next.assignedBracket}  (${cards.length} cards)  ${next.determiningSignals.map((s) => s.label).join(", ") || "baseline"}`,
    );
  }
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
