/**
 * Professor brew full deck list — fixture lists for build-room grid (99 + commander).
 */
import type { BrewFixtureCaseV42 } from "./professor-brew-fixtures-v4-2-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import { MEREN_PACKAGE_CARDS } from "./professor-brew-tree-v4-2-v1";

export const PROFESSOR_BREW_DECK_LIST_V4_3_V1_VERSION = "professor-brew-deck-list-v4-3-v1";

export type ProfessorDeckListEntryV43 = {
  name: string;
  category: "commander" | "creature" | "artifact" | "enchantment" | "instant" | "sorcery" | "land" | "plan";
};

const MEREN_NONLAND: ProfessorDeckListEntryV43[] = [
  { name: "Sakura-Tribe Elder", category: "creature" },
  { name: "Wood Elves", category: "creature" },
  { name: "Elves of Deep Shadow", category: "creature" },
  { name: "Fleshbag Marauder", category: "creature" },
  { name: "Spore Frog", category: "creature" },
  { name: "Reclamation Sage", category: "creature" },
  { name: "Eternal Witness", category: "creature" },
  { name: "Viscera Seer", category: "creature" },
  { name: "Blood Artist", category: "creature" },
  { name: "Pitiless Plunderer", category: "creature" },
  { name: "Gravecrawler", category: "creature" },
  { name: "Stitcher's Supplier", category: "creature" },
  { name: "Caustic Caterpillar", category: "creature" },
  { name: "Shambling Ghast", category: "creature" },
  { name: "Plaguecrafter", category: "creature" },
  { name: "Ravenous Chupacabra", category: "creature" },
  { name: "Gray Merchant of Asphodel", category: "creature" },
  { name: "Skullclamp", category: "artifact" },
  { name: "Ashnod's Altar", category: "artifact" },
  { name: "Altar of Dementia", category: "artifact" },
  { name: "Sol Ring", category: "artifact" },
  { name: "Lightning Greaves", category: "artifact" },
  { name: "Swiftfoot Boots", category: "artifact" },
  { name: "Skullclamp", category: "artifact" },
  { name: "Nature's Lore", category: "sorcery" },
  { name: "Cultivate", category: "sorcery" },
  { name: "Kodama's Reach", category: "sorcery" },
  { name: "Living Death", category: "sorcery" },
  { name: "Victimize", category: "sorcery" },
  { name: "Beast Within", category: "instant" },
  { name: "Assassin's Trophy", category: "instant" },
  { name: "Heroic Intervention", category: "instant" },
  { name: "Malakir Rebirth", category: "instant" },
  { name: "Putrefy", category: "instant" },
  { name: "Casualties of War", category: "sorcery" },
  { name: "Grim Haruspex", category: "creature" },
  { name: "Midnight Reaper", category: "creature" },
  { name: "Evolutionary Leap", category: "enchantment" },
  { name: "Moldervine Reclamation", category: "enchantment" },
  { name: "Doubling Season", category: "enchantment" },
  { name: "Command Beacon", category: "land" },
  { name: "Bojuka Bog", category: "land" },
  { name: "Strip Mine", category: "land" },
  { name: "Wasteland", category: "land" },
  { name: "Overgrown Tomb", category: "land" },
  { name: "Woodland Cemetery", category: "land" },
  { name: "Llanowar Wastes", category: "land" },
  { name: "Golgari Rot Farm", category: "land" },
  { name: "Temple of Malady", category: "land" },
  { name: "Necroblossom Snarl", category: "land" },
  { name: "Path of Ancestry", category: "land" },
  { name: "Exotic Orchard", category: "land" },
  { name: "Reliquary Tower", category: "land" },
  { name: "War Room", category: "land" },
  { name: "Bonder's Ornament", category: "artifact" },
  { name: "Mind Stone", category: "artifact" },
  { name: "Arcane Signet", category: "artifact" },
  { name: "Fyndhorn Elves", category: "creature" },
  { name: "Llanowar Elves", category: "creature" },
  { name: "Dread Return", category: "sorcery" },
  { name: "Victimize", category: "sorcery" },
  { name: "Reanimate", category: "sorcery" },
  { name: "Animate Dead", category: "enchantment" },
  { name: "Necromancy", category: "enchantment" },
  { name: "Phyrexian Arena", category: "enchantment" },
  { name: "Guardian Project", category: "enchantment" },
  { name: "Garruk's Uprising", category: "enchantment" },
  { name: "Toxic Deluge", category: "sorcery" },
  { name: "Damnation", category: "sorcery" },
  { name: "Tangle", category: "instant" },
  { name: "Autumn's Veil", category: "instant" },
  { name: "Veil of Summer", category: "instant" },
  { name: "Nature's Claim", category: "instant" },
  { name: "Return to Nature", category: "instant" },
  { name: "Haywire Mite", category: "artifact" },
  { name: "Soul-Guide Lantern", category: "artifact" },
  { name: "Urborg, Tomb of Yawgmoth", category: "land" },
  { name: "Cabal Coffers", category: "land" },
  { name: "Twilight Mire", category: "land" },
  { name: "Undergrowth Stadium", category: "land" },
  { name: "Deathcap Glade", category: "land" },
  { name: "Darkbore Pathway", category: "land" },
  { name: "Barkchannel Pathway", category: "land" },
  { name: "Field of the Dead", category: "land" },
  { name: "Yavimaya, Cradle of Growth", category: "land" },
  { name: "Takenuma, Abandoned Mire", category: "land" },
  { name: "Boseiju, Who Endures", category: "land" },
];

const CHATTERFANG_NONLAND: ProfessorDeckListEntryV43[] = [
  { name: "Academy Manufactor", category: "artifact" },
  { name: "Jaheira, Friend of the Forest", category: "creature" },
  { name: "Doubling Season", category: "enchantment" },
  { name: "Parallel Lives", category: "enchantment" },
  { name: "Anointed Procession", category: "enchantment" },
  { name: "Pitiless Plunderer", category: "creature" },
  { name: "Blood Artist", category: "creature" },
  { name: "Zulaport Cutthroat", category: "creature" },
  { name: "Bastion of Remembrance", category: "enchantment" },
  { name: "Viscera Seer", category: "creature" },
  { name: "Ashnod's Altar", category: "artifact" },
  { name: "Phyrexian Altar", category: "artifact" },
  { name: "Altar of the Brood", category: "artifact" },
  { name: "Squirrel Nest", category: "enchantment" },
  { name: "Squirrel Sanctuary", category: "enchantment" },
  { name: "Chatterstorm", category: "instant" },
  { name: "Deep Forest Hermit", category: "creature" },
  { name: "Nesting Squirrels", category: "creature" },
  { name: "Acorn Harvest", category: "sorcery" },
  { name: "Bootleggers' Stash", category: "artifact" },
  { name: "Smothering Tithe", category: "enchantment" },
  { name: "Tendershoot Dryad", category: "creature" },
  { name: "Scute Swarm", category: "creature" },
  { name: "Beast Within", category: "instant" },
  { name: "Assassin's Trophy", category: "instant" },
  { name: "Abrupt Decay", category: "instant" },
  { name: "Putrefy", category: "instant" },
  { name: "Heroic Intervention", category: "instant" },
  { name: "Nature's Claim", category: "instant" },
  { name: "Cultivate", category: "sorcery" },
  { name: "Kodama's Reach", category: "sorcery" },
  { name: "Nature's Lore", category: "sorcery" },
  { name: "Three Visits", category: "sorcery" },
  { name: "Farseek", category: "sorcery" },
  { name: "Rampant Growth", category: "sorcery" },
  { name: "Skyfisher Spider", category: "creature" },
  { name: "Gilded Goose", category: "creature" },
  { name: "Squirrel Dealer", category: "creature" },
  { name: "Chatterfang, Squirrel General", category: "creature" },
  { name: "Squirrel Mob", category: "creature" },
  { name: "Squirrel Sovereign", category: "creature" },
  { name: "Nut Collector", category: "creature" },
  { name: "Chatter of the Squirrel", category: "instant" },
  { name: "Primal Vigor", category: "enchantment" },
  { name: "Hardened Scales", category: "enchantment" },
  { name: "Inspiring Call", category: "instant" },
  { name: "Garruk's Uprising", category: "enchantment" },
  { name: "Craterhoof Behemoth", category: "creature" },
  { name: "End-Raze Forerunners", category: "creature" },
  { name: "Triumph of the Hordes", category: "instant" },
  { name: "Overwhelming Stampede", category: "sorcery" },
  { name: "Coat of Arms", category: "artifact" },
  { name: "Vanquisher's Banner", category: "artifact" },
  { name: "Lightning Greaves", category: "artifact" },
  { name: "Swiftfoot Boots", category: "artifact" },
  { name: "Sol Ring", category: "artifact" },
  { name: "Arcane Signet", category: "artifact" },
  { name: "Talisman of Resilience", category: "artifact" },
  { name: "Fellwar Stone", category: "artifact" },
  { name: "Command Tower", category: "land" },
  { name: "Overgrown Tomb", category: "land" },
  { name: "Woodland Cemetery", category: "land" },
  { name: "Llanowar Wastes", category: "land" },
  { name: "Golgari Rot Farm", category: "land" },
  { name: "Temple of Malady", category: "land" },
  { name: "Necroblossom Snarl", category: "land" },
  { name: "Path of Ancestry", category: "land" },
  { name: "Exotic Orchard", category: "land" },
  { name: "Reliquary Tower", category: "land" },
  { name: "Bojuka Bog", category: "land" },
  { name: "Strip Mine", category: "land" },
  { name: "Takenuma, Abandoned Mire", category: "land" },
  { name: "Boseiju, Who Endures", category: "land" },
  { name: "Yavimaya, Cradle of Growth", category: "land" },
  { name: "Undergrowth Stadium", category: "land" },
  { name: "Deathcap Glade", category: "land" },
  { name: "Darkbore Pathway", category: "land" },
  { name: "Barkchannel Pathway", category: "land" },
  { name: "Field of the Dead", category: "land" },
  { name: "Urborg, Tomb of Yawgmoth", category: "land" },
  { name: "Twilight Mire", category: "land" },
  { name: "War Room", category: "land" },
  { name: "Bonders' Ornament", category: "artifact" },
  { name: "Mind Stone", category: "artifact" },
  { name: "Haywire Mite", category: "artifact" },
  { name: "Soul-Guide Lantern", category: "artifact" },
  { name: "Toxic Deluge", category: "sorcery" },
  { name: "Casualties of War", category: "sorcery" },
  { name: "Casualties of War", category: "sorcery" },
];

function looksLikeCardName(value: string): boolean {
  const v = value.trim();
  if (v.length < 4 || v.length > 48) return false;
  if (/^(ENABLER|FUEL|ENGINE|PAYOFF|PROTECTION|RECOVERY|CONVERSION|COMMANDER)/i.test(v)) return false;
  if (/produce|create|generate|payoff|drain|win|finish|scale|death|token|resource/i.test(v) && !v.includes(",")) return false;
  return /^[A-Z][A-Za-z0-9' ,\-]+$/.test(v);
}

function dedupeEntries(entries: ProfessorDeckListEntryV43[]): ProfessorDeckListEntryV43[] {
  const seen = new Set<string>();
  const out: ProfessorDeckListEntryV43[] = [];
  for (const e of entries) {
    const key = e.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

const COLOR_TO_BASIC: Record<string, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

/** Singleton mana-fixing lands — never duplicated in Commander. */
const MULTICOLOR_MANA_STAPLES = ["Command Tower", "Path of Ancestry", "Exotic Orchard"] as const;
const UTILITY_LAND_STAPLES = ["Reliquary Tower"] as const;

function normalizeColors(colorIdentity: string[]): string[] {
  return colorIdentity.length > 0 ? [...new Set(colorIdentity)] : ["G"];
}

function buildLandPadding(args: {
  colorIdentity: string[];
  landSlotsNeeded: number;
  seenLandNames: Set<string>;
}): ProfessorDeckListEntryV43[] {
  if (args.landSlotsNeeded <= 0) return [];

  const colors = normalizeColors(args.colorIdentity);
  const out: ProfessorDeckListEntryV43[] = [];
  let remaining = args.landSlotsNeeded;

  const staplePool =
    colors.length >= 2
      ? [...MULTICOLOR_MANA_STAPLES, ...UTILITY_LAND_STAPLES]
      : [...UTILITY_LAND_STAPLES];

  for (const name of staplePool) {
    if (remaining <= 0) break;
    const key = name.toLowerCase();
    if (args.seenLandNames.has(key)) continue;
    out.push({ name, category: "land" });
    args.seenLandNames.add(key);
    remaining--;
  }

  let colorIdx = 0;
  while (remaining > 0) {
    const basic = COLOR_TO_BASIC[colors[colorIdx % colors.length]!] ?? "Forest";
    out.push({ name: basic, category: "land" });
    remaining--;
    colorIdx++;
  }

  return out;
}

/** Build land names to pad mana base — exported for council assembly v4.8. */
export function buildProfessorManaBaseLandNamesV48(args: {
  colorIdentity: string[];
  existingNames: string[];
  count: number;
}): string[] {
  if (args.count <= 0) return [];
  const seenLandNames = new Set(args.existingNames.map((n) => n.toLowerCase()));
  return buildLandPadding({
    colorIdentity: args.colorIdentity,
    landSlotsNeeded: args.count,
    seenLandNames,
  }).map((e) => e.name);
}

function collectTheoryDeckEntries(theory: WorkingDeckTheoryV4): ProfessorDeckListEntryV43[] {
  const names: string[] = [];
  for (const pkg of theory.packages) {
    const treeCards = MEREN_PACKAGE_CARDS[pkg.packageId]?.map((c) => c.name) ?? [];
    names.push(...treeCards, ...pkg.candidateCards.filter(looksLikeCardName));
  }
  return dedupeEntries(names.map((name) => ({ name, category: "plan" as const })));
}

/** Pad to 100 cards: real spells + ~36 lands. Never duplicate unique lands like Command Tower. */
function padTo99WithColorIdentity(
  entries: ProfessorDeckListEntryV43[],
  commander: string,
  colorIdentity: string[],
): ProfessorDeckListEntryV43[] {
  const TARGET_TOTAL = 100;
  const TARGET_LANDS = 36;

  const list: ProfessorDeckListEntryV43[] = [{ name: commander, category: "commander" }, ...dedupeEntries(entries)];
  const seenLandNames = new Set(
    list.filter((e) => e.category === "land").map((e) => e.name.toLowerCase()),
  );
  let landCount = list.filter((e) => e.category === "land").length;
  const landSlotsNeeded = Math.max(0, TARGET_LANDS - landCount);
  const maxLandSlots = Math.max(0, TARGET_TOTAL - list.length);
  const landPadding = buildLandPadding({
    colorIdentity,
    landSlotsNeeded: Math.min(landSlotsNeeded, maxLandSlots),
    seenLandNames,
  });

  list.push(...landPadding);
  return list.slice(0, TARGET_TOTAL);
}

function padTo99(entries: ProfessorDeckListEntryV43[], commander: string, forestCount = 12, swampCount = 11): ProfessorDeckListEntryV43[] {
  const TARGET_TOTAL = 100;
  const list: ProfessorDeckListEntryV43[] = [{ name: commander, category: "commander" }, ...dedupeEntries(entries)];

  for (let i = 0; i < forestCount && list.length < TARGET_TOTAL; i++) {
    list.push({ name: "Forest", category: "land" });
  }
  for (let i = 0; i < swampCount && list.length < TARGET_TOTAL; i++) {
    list.push({ name: "Swamp", category: "land" });
  }

  return list.slice(0, TARGET_TOTAL);
}

export function buildProfessorDeckListFromTheoryV44(args: {
  theory: WorkingDeckTheoryV4;
  colorIdentity: string[];
}): ProfessorDeckListEntryV43[] {
  const merged = collectTheoryDeckEntries(args.theory);
  return padTo99WithColorIdentity(merged, args.theory.commander, args.colorIdentity);
}

export function buildProfessorDeckListV43(args: {
  fixtureCase?: BrewFixtureCaseV42 | null;
  theory: WorkingDeckTheoryV4;
  colorIdentity?: string[];
}): ProfessorDeckListEntryV43[] {
  if (!args.fixtureCase) {
    return buildProfessorDeckListFromTheoryV44({
      theory: args.theory,
      colorIdentity: args.colorIdentity ?? [],
    });
  }
  const base = args.fixtureCase === "chatterfang" ? CHATTERFANG_NONLAND : MEREN_NONLAND;
  const fromPackages = args.theory.packages.flatMap((pkg) => {
    const treeCards = MEREN_PACKAGE_CARDS[pkg.packageId]?.map((c) => c.name) ?? [];
    return [...treeCards, ...pkg.candidateCards.filter(looksLikeCardName)];
  });
  const merged = dedupeEntries([
    ...base,
    ...fromPackages.map((name) => ({ name, category: "plan" as const })),
  ]);
  return padTo99(merged, args.theory.commander);
}

export function deckListCardNames(list: ProfessorDeckListEntryV43[]): string[] {
  return list.map((c) => c.name);
}

/** Archidekt-style text export: commander block + quantity lines for the 99. */
export function formatProfessorDeckListText(list: ProfessorDeckListEntryV43[]): string {
  const counts = new Map<string, number>();
  let commander: string | null = null;

  for (const entry of list) {
    if (entry.category === "commander") {
      commander = entry.name;
      continue;
    }
    counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
  }

  const lines: string[] = [];
  if (commander) {
    lines.push("Commander");
    lines.push(`1 ${commander}`);
    lines.push("");
    lines.push("Deck");
  }

  for (const [name, qty] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`${qty} ${name}`);
  }

  return lines.join("\n");
}

export function professorDeckListDownloadFilename(commanderName: string): string {
  const slug = commanderName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "professor-deck"}.txt`;
}
