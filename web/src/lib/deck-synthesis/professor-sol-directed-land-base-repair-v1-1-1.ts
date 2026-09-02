/**
 * Deterministic land-base repair — Constructor/Critic cannot always fix mana bases.
 */
import { resolveCanonicalCardTruthV4164 } from "./professor-canonical-card-truth-v4-16-4-v1";
import { isCanonicalLandForDeckPartition } from "./professor-canonical-deck-partition-v1";
import { isBasicLandName } from "./professor-commander-legality-v4-9-v1";
import { normalizeCardNameForMatch } from "./professor-canonical-card-identity-v4-15-1-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { SolDirectedHeadProfessorWholeDeckVerdictV111 } from "./professor-sol-directed-head-professor-v1-1-1";
import type {
  LandPoolEntryV11,
  LandPoolV11,
  RetrievalContractV11,
  SolDirectedConstructedDeckV11,
} from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_LAND_BASE_REPAIR_V1_1_1_VERSION =
  "professor-sol-directed-land-base-repair-v1-1-1";

const HIGH_RISK_LAND_NAMES = [
  "Lotus Vale",
  "Ancient Ziggurat",
  "City of Shadows",
  "Subterranean Hangar",
  "Miren, the Moaning Well",
  "Crystal Vein",
  "Dust Bowl",
];

function landCopies(deck: SolDirectedConstructedDeckV11): number {
  return deck.lands.reduce((sum, land) => sum + land.copies, 0);
}

function mergeLandRows(
  lands: SolDirectedConstructedDeckV11["lands"],
): SolDirectedConstructedDeckV11["lands"] {
  const merged = new Map<string, { name: string; copies: number }>();
  for (const land of lands) {
    const key = normalizeCardNameForMatch(land.name);
    const existing = merged.get(key);
    if (existing) existing.copies += land.copies;
    else merged.set(key, { name: land.name.trim(), copies: land.copies });
  }
  return [...merged.values()];
}

function findLandPoolEntry(landPool: LandPoolV11, name: string): LandPoolEntryV11 | null {
  const key = normalizeCardNameForMatch(name);
  return landPool.entries.find((entry) => normalizeCardNameForMatch(entry.name) === key) ?? null;
}

function primaryBasicEntry(landPool: LandPoolV11, colorIdentity: string[]): LandPoolEntryV11 | null {
  const identityEntries = landPool.entries
    .filter((entry) => entry.isBasic && entry.maxCopies > 0)
    .sort((a, b) => b.maxCopies - a.maxCopies);

  if (colorIdentity.length === 1 && colorIdentity.includes("W")) {
    return (
      identityEntries.find((entry) => normalizeCardNameForMatch(entry.name) === normalizeCardNameForMatch("Plains")) ??
      identityEntries[0] ??
      null
    );
  }
  if (colorIdentity.length === 1 && colorIdentity.includes("B")) {
    return identityEntries.find((entry) => entry.basicKind === "swamp") ?? identityEntries[0] ?? null;
  }
  if (colorIdentity.length === 1 && colorIdentity.includes("G")) {
    return identityEntries.find((entry) => entry.basicKind === "forest") ?? identityEntries[0] ?? null;
  }

  return identityEntries[0] ?? null;
}

function basicTargetFromContract(args: {
  contract: RetrievalContractV11;
  landPool: LandPoolV11;
  colorIdentity: string[];
}): number {
  const architecture = (args.contract.landPlan as { architecture?: Array<{ role?: string; count?: number }> })
    ?.architecture;
  if (Array.isArray(architecture)) {
    let totalBasics = 0;
    for (const row of architecture) {
      const role = String(row.role ?? "").toLowerCase();
      if (role.includes("basic") || role.includes("forest") || role.includes("swamp") || role.includes("island")) {
        totalBasics += Number(row.count ?? 0);
      }
    }
    if (totalBasics > 0) return totalBasics;
  }

  const swampSlots = args.landPool.basicSwampSlots;
  const forestSlots = args.landPool.basicForestSlots;
  if (args.colorIdentity.length === 1 && args.colorIdentity.includes("B") && swampSlots > 0) {
    return Math.min(swampSlots, Math.max(14, Math.floor(args.contract.landSlotsRequired * 0.45)));
  }
  if (args.colorIdentity.length === 1 && args.colorIdentity.includes("G") && forestSlots > 0) {
    return Math.min(forestSlots, Math.max(14, Math.floor(args.contract.landSlotsRequired * 0.45)));
  }

  const primary = primaryBasicEntry(args.landPool, args.colorIdentity);
  if (primary) {
    return Math.min(primary.maxCopies, Math.max(10, Math.floor(args.contract.landSlotsRequired * 0.35)));
  }
  return 10;
}

function countBasicCopies(deck: SolDirectedConstructedDeckV11, basicKind: LandPoolEntryV11["basicKind"]): number {
  return deck.lands
    .filter((land) => {
      if (basicKind === "swamp") return normalizeCardNameForMatch(land.name) === normalizeCardNameForMatch("Swamp");
      if (basicKind === "forest") return normalizeCardNameForMatch(land.name) === normalizeCardNameForMatch("Forest");
      return isBasicLandName(land.name);
    })
    .reduce((sum, land) => sum + land.copies, 0);
}

function removeLandCopiesByName(deck: SolDirectedConstructedDeckV11, name: string, copies: number): number {
  const key = normalizeCardNameForMatch(name);
  const row = deck.lands.find((land) => normalizeCardNameForMatch(land.name) === key);
  if (!row || row.copies <= 0) return 0;
  const delta = Math.min(copies, row.copies);
  row.copies -= delta;
  deck.lands = deck.lands.filter((land) => land.copies > 0);
  return delta;
}

function addLandCopiesByName(deck: SolDirectedConstructedDeckV11, name: string, copies: number): number {
  if (copies <= 0) return 0;
  const key = normalizeCardNameForMatch(name);
  const row = deck.lands.find((land) => normalizeCardNameForMatch(land.name) === key);
  if (row) row.copies += copies;
  else deck.lands.push({ name: name.trim(), copies });
  return copies;
}

function extractRemoveLandNames(requiredChanges: string[]): string[] {
  const names: string[] = [];
  for (const change of requiredChanges) {
    const removeMatch = change.match(/\bRemove\s+([^.,]+?)(?:\s+from|\s+before|\.|,|$)/i);
    if (removeMatch?.[1]) names.push(removeMatch[1].trim());
    const replaceMatch = change.match(/\bReplace\s+(?:the\s+)?([^.,]+?)(?:\s+with|\s+before|\.|,|$)/i);
    if (replaceMatch?.[1]) names.push(replaceMatch[1].trim());
  }
  return names;
}

function isLandInDeck(deck: SolDirectedConstructedDeckV11, name: string): boolean {
  const key = normalizeCardNameForMatch(name);
  return deck.lands.some((land) => normalizeCardNameForMatch(land.name) === key && land.copies > 0);
}

function isKnownLandName(args: {
  name: string;
  catalog: DeckResolutionCatalog;
  deck: SolDirectedConstructedDeckV11;
}): boolean {
  if (isLandInDeck(args.deck, args.name)) return true;
  if (isBasicLandName(args.name)) return true;
  const truth = resolveCanonicalCardTruthV4164({
    name: args.name,
    catalog: args.catalog,
  });
  return isCanonicalLandForDeckPartition(truth);
}

function cutPriority(name: string, forcedCutNames: Set<string>): number {
  const key = normalizeCardNameForMatch(name);
  if (forcedCutNames.has(key)) return 1000;
  if (HIGH_RISK_LAND_NAMES.some((risk) => normalizeCardNameForMatch(risk) === key)) return 900;
  if (isBasicLandName(name)) return 0;
  return 100;
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function architectureTargetsFromContract(contract: RetrievalContractV11): {
  fetch: number;
  dual: number;
  basic: number;
} {
  const targets = { fetch: 0, dual: 0, basic: 0 };
  const architecture = (contract.landPlan as { architecture?: Array<{ role?: string; count?: number }> })
    ?.architecture;
  if (!Array.isArray(architecture)) return targets;
  for (const row of architecture) {
    const role = String(row.role ?? "").toLowerCase();
    const count = Number(row.count ?? 0);
    if (count <= 0) continue;
    if (role.includes("fetch")) targets.fetch += count;
    else if (role.includes("dual") || role.includes("shock") || role.includes("triome") || role.includes("multicolor")) {
      targets.dual += count;
    } else if (role.includes("basic") || role.includes("forest") || role.includes("swamp") || role.includes("mountain") || role.includes("island") || role.includes("plains")) {
      targets.basic += count;
    }
  }
  return targets;
}

function parseFetchMinimumFromText(texts: string[]): number {
  let min = 0;
  for (const text of texts) {
    const match = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s*(?:\+|\s*or more\s*)?\s*fetch/i);
    if (!match?.[1]) continue;
    const parsed = WORD_NUMBERS[match[1].toLowerCase()] ?? Number(match[1]);
    if (Number.isFinite(parsed)) min = Math.max(min, parsed);
  }
  return min;
}

function landCopiesForEntry(deck: SolDirectedConstructedDeckV11, entry: LandPoolEntryV11): number {
  const key = normalizeCardNameForMatch(entry.name);
  return deck.lands.find((land) => normalizeCardNameForMatch(land.name) === key)?.copies ?? 0;
}

function canAddLandEntry(deck: SolDirectedConstructedDeckV11, entry: LandPoolEntryV11): boolean {
  return landCopiesForEntry(deck, entry) < entry.maxCopies;
}

function replaceLandWithEntry(args: {
  deck: SolDirectedConstructedDeckV11;
  cutName: string;
  addEntry: LandPoolEntryV11;
}): string | null {
  const cutKey = normalizeCardNameForMatch(args.cutName);
  const row = args.deck.lands.find((land) => normalizeCardNameForMatch(land.name) === cutKey);
  if (!row || row.copies <= 0) return null;
  if (!canAddLandEntry(args.deck, args.addEntry)) return null;

  removeLandCopiesByName(args.deck, args.cutName, 1);
  addLandCopiesByName(args.deck, args.addEntry.name, 1);
  return `${args.cutName} → ${args.addEntry.name}`;
}

function countDeckLandCategory(deck: SolDirectedConstructedDeckV11, landPool: LandPoolV11, category: LandPoolEntryV11["category"]): number {
  let total = 0;
  for (const land of deck.lands) {
    const entry = findLandPoolEntry(landPool, land.name);
    if (entry?.category === category) total += land.copies;
  }
  return total;
}

function pickBasicLandToCut(deck: SolDirectedConstructedDeckV11, colorIdentity: string[]): string | null {
  const basicCounts = new Map<string, number>();
  for (const land of deck.lands) {
    if (!isBasicLandName(land.name)) continue;
    const key = normalizeCardNameForMatch(land.name);
    basicCounts.set(key, (basicCounts.get(key) ?? 0) + land.copies);
  }
  if (basicCounts.size === 0) {
    const nonBasic = deck.lands.find((land) => !isBasicLandName(land.name) && land.copies > 0);
    return nonBasic?.name ?? null;
  }

  let bestName: string | null = null;
  let bestScore = -1;
  for (const [key, copies] of basicCounts) {
    const display = deck.lands.find((land) => normalizeCardNameForMatch(land.name) === key)?.name ?? key;
    let score = copies;
    if (colorIdentity.length > 1 && normalizeCardNameForMatch(display) === normalizeCardNameForMatch("Forest")) {
      score += 20;
    }
    if (copies > bestScore) {
      bestScore = copies;
      bestName = display;
    }
  }
  return bestName;
}

function pickUpgradeLandEntry(args: {
  deck: SolDirectedConstructedDeckV11;
  landPool: LandPoolV11;
  targets: { fetch: number; dual: number };
  preferCategories?: LandPoolEntryV11["category"][];
}): LandPoolEntryV11 | null {
  const categories = args.preferCategories ?? ["fetch", "dual", "utility", "other"];
  for (const category of categories) {
    const current = countDeckLandCategory(args.deck, args.landPool, category);
    const target =
      category === "fetch" ? args.targets.fetch : category === "dual" ? args.targets.dual : 0;
    if (category === "fetch" || category === "dual") {
      if (target > 0 && current >= target) continue;
    }
    const candidates = args.landPool.entries
      .filter((entry) => entry.category === category && canAddLandEntry(args.deck, entry))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (candidates[0]) return candidates[0];
  }
  return null;
}

function repairPremiumLandPackage(args: {
  deck: SolDirectedConstructedDeckV11;
  landPool: LandPoolV11;
  contract: RetrievalContractV11;
  professorVerdict?: SolDirectedHeadProfessorWholeDeckVerdictV111 | null;
  colorIdentity: string[];
}): string[] {
  const repairs: string[] = [];
  const architecture = architectureTargetsFromContract(args.contract);
  const professorTexts = [
    ...(args.professorVerdict?.requiredChanges ?? []),
    args.professorVerdict?.manaAssessment ?? "",
    args.professorVerdict?.reasoningSummary ?? "",
  ];
  const fetchTarget = Math.max(architecture.fetch, parseFetchMinimumFromText(professorTexts));
  const dualTarget = architecture.dual;

  const upgradeTargets = { fetch: fetchTarget, dual: dualTarget };
  for (const category of ["fetch", "dual"] as const) {
    const target = category === "fetch" ? fetchTarget : dualTarget;
    if (target <= 0) continue;
    while (countDeckLandCategory(args.deck, args.landPool, category) < target) {
      const addEntry = pickUpgradeLandEntry({
        deck: args.deck,
        landPool: args.landPool,
        targets: upgradeTargets,
        preferCategories: [category],
      });
      const cutName = pickBasicLandToCut(args.deck, args.colorIdentity);
      if (!addEntry || !cutName) break;
      const swap = replaceLandWithEntry({ deck: args.deck, cutName, addEntry });
      if (!swap) break;
      repairs.push(`${category} upgrade: ${swap}`);
    }
  }

  return repairs;
}

function rebalanceMulticolorBasics(args: {
  deck: SolDirectedConstructedDeckV11;
  landPool: LandPoolV11;
  colorIdentity: string[];
}): string[] {
  const repairs: string[] = [];
  if (args.colorIdentity.length < 2) return repairs;

  const basicEntries = args.landPool.entries.filter((entry) => entry.isBasic && entry.maxCopies > 0);
  if (basicEntries.length === 0) return repairs;

  const forestCopies = countBasicCopies(args.deck, "forest");
  const perColorTarget = Math.max(4, Math.floor(args.deck.landCount / Math.max(2, args.colorIdentity.length + 1)));
  if (forestCopies <= perColorTarget + 4) return repairs;

  for (const entry of basicEntries) {
    if (normalizeCardNameForMatch(entry.name) === normalizeCardNameForMatch("Forest")) continue;
    while (landCopiesForEntry(args.deck, entry) < perColorTarget) {
      const cutName = pickBasicLandToCut(args.deck, args.colorIdentity);
      if (!cutName || !canAddLandEntry(args.deck, entry)) break;
      const swap = replaceLandWithEntry({ deck: args.deck, cutName, addEntry: entry });
      if (!swap) break;
      repairs.push(`color balance: ${swap}`);
    }
  }

  return repairs;
}

function replaceLandWithBasic(args: {
  deck: SolDirectedConstructedDeckV11;
  cutName: string;
  addEntry: LandPoolEntryV11;
  landPool: LandPoolV11;
}): string | null {
  return replaceLandWithEntry({ deck: args.deck, cutName: args.cutName, addEntry: args.addEntry });
}

function professorMentionsBasicSkew(professorVerdict?: SolDirectedHeadProfessorWholeDeckVerdictV111 | null): boolean {
  if (!professorVerdict) return false;
  const pattern = /\b(basic[- ]heavy|overallocat.*basic|basic forest|green-skewed|too many basic)\b/i;
  return professorVerdict.requiredChanges.some((change) => pattern.test(change));
}

function shouldBoostMonoColorBasicDensity(args: {
  colorIdentity: string[];
  contract: RetrievalContractV11;
  professorVerdict?: SolDirectedHeadProfessorWholeDeckVerdictV111 | null;
}): boolean {
  if (args.colorIdentity.length !== 1) return false;
  if (professorMentionsBasicSkew(args.professorVerdict)) return false;
  const architecture = architectureTargetsFromContract(args.contract);
  if (architecture.fetch > 0) return false;
  if (
    args.professorVerdict &&
    /\b(plains|white mana|colorless|fail to produce white|mana base)\b/i.test(
      [...args.professorVerdict.requiredChanges, args.professorVerdict.manaAssessment].join(" "),
    )
  ) {
    return true;
  }
  return args.colorIdentity.includes("W") || args.colorIdentity.includes("B") || args.colorIdentity.includes("G");
}

function repairMonoWhitePlainsPackage(args: {
  deck: SolDirectedConstructedDeckV11;
  landPool: LandPoolV11;
  contract: RetrievalContractV11;
  professorVerdict?: SolDirectedHeadProfessorWholeDeckVerdictV111 | null;
  colorIdentity: string[];
}): string[] {
  const repairs: string[] = [];
  if (args.colorIdentity.length !== 1 || !args.colorIdentity.includes("W")) return repairs;

  const professorTexts = [
    ...(args.professorVerdict?.requiredChanges ?? []),
    args.professorVerdict?.manaAssessment ?? "",
  ].join(" ");
  const needsPlainsBoost =
    /\b(plains|white mana|colorless|fail to produce white|mana base|low-synergy lands)\b/i.test(professorTexts);
  if (!needsPlainsBoost) return repairs;

  const plainsEntry = findLandPoolEntry(args.landPool, "Plains");
  if (!plainsEntry) return repairs;

  const targetPlains = Math.max(
    14,
    architectureTargetsFromContract(args.contract).basic ||
      Math.floor((args.contract.landSlotsRequired || 36) * 0.42),
  );

  let plainsCount = landCopiesForEntry(args.deck, plainsEntry);
  const colorlessPriority = (name: string): number => {
    const key = normalizeCardNameForMatch(name);
    if (key === normalizeCardNameForMatch("Plains")) return -1;
    if (isBasicLandName(name)) return 0;
    if (/tower|pathway|utility|scape|den|forge|pool|matrix|yard|temple|gate/i.test(name)) return 900;
    return 400;
  };

  const cutCandidates = [...args.deck.lands]
    .filter((land) => normalizeCardNameForMatch(land.name) !== normalizeCardNameForMatch("Plains"))
    .sort((a, b) => colorlessPriority(b.name) - colorlessPriority(a.name));

  while (plainsCount < targetPlains && cutCandidates.length > 0) {
    const cut = cutCandidates.find((land) => land.copies > 0);
    if (!cut) break;
    const swap = replaceLandWithEntry({
      deck: args.deck,
      cutName: cut.name,
      addEntry: plainsEntry,
    });
    if (!swap) {
      cut.copies = 0;
      continue;
    }
    repairs.push(`mono-white mana: ${swap}`);
    plainsCount += 1;
    if (cut.copies <= 0) {
      const idx = cutCandidates.indexOf(cut);
      if (idx >= 0) cutCandidates.splice(idx, 1);
    }
  }

  return repairs;
}

export function repairSolDirectedLandBaseV111(args: {
  deck: SolDirectedConstructedDeckV11;
  landPool: LandPoolV11;
  contract: RetrievalContractV11;
  catalog: DeckResolutionCatalog;
  professorVerdict?: SolDirectedHeadProfessorWholeDeckVerdictV111 | null;
}): { deck: SolDirectedConstructedDeckV11; repairs: string[] } {
  const repairs: string[] = [];
  const deck: SolDirectedConstructedDeckV11 = {
    ...args.deck,
    lands: mergeLandRows(args.deck.lands),
    nonlands: [...args.deck.nonlands],
  };

  const colorIdentity = deck.commander.colorIdentity;
  const primaryBasic = primaryBasicEntry(args.landPool, colorIdentity);
  if (!primaryBasic) {
    deck.landCount = landCopies(deck);
    return { deck, repairs };
  }

  const forcedCutNames = new Set<string>();
  if (args.professorVerdict) {
    for (const name of args.professorVerdict.offPlanCards) {
      if (isKnownLandName({ name, catalog: args.catalog, deck })) {
        forcedCutNames.add(normalizeCardNameForMatch(name));
      }
    }
    for (const name of extractRemoveLandNames(args.professorVerdict.requiredChanges)) {
      if (isKnownLandName({ name, catalog: args.catalog, deck })) {
        forcedCutNames.add(normalizeCardNameForMatch(name));
      }
    }
  }

  for (const cutName of [...forcedCutNames]) {
    const displayName =
      deck.lands.find((land) => normalizeCardNameForMatch(land.name) === cutName)?.name ??
      HIGH_RISK_LAND_NAMES.find((risk) => normalizeCardNameForMatch(risk) === cutName) ??
      cutName;
    while (isLandInDeck(deck, displayName)) {
      const upgradeEntry =
        pickUpgradeLandEntry({
          deck,
          landPool: args.landPool,
          targets: architectureTargetsFromContract(args.contract),
          preferCategories: colorIdentity.length > 1 ? ["fetch", "dual", "utility"] : ["utility", "other"],
        }) ?? primaryBasic;
      const swap = replaceLandWithEntry({
        deck,
        cutName: displayName,
        addEntry: upgradeEntry,
      });
      if (!swap) break;
      repairs.push(`off-plan land: ${swap}`);
    }
  }

  repairs.push(
    ...repairPremiumLandPackage({
      deck,
      landPool: args.landPool,
      contract: args.contract,
      professorVerdict: args.professorVerdict,
      colorIdentity,
    }),
  );
  repairs.push(
    ...rebalanceMulticolorBasics({
      deck,
      landPool: args.landPool,
      colorIdentity,
    }),
  );
  repairs.push(
    ...repairMonoWhitePlainsPackage({
      deck,
      landPool: args.landPool,
      contract: args.contract,
      professorVerdict: args.professorVerdict,
      colorIdentity,
    }),
  );

  if (
    shouldBoostMonoColorBasicDensity({
      colorIdentity,
      contract: args.contract,
      professorVerdict: args.professorVerdict,
    })
  ) {
    const basicTarget = basicTargetFromContract({
      contract: args.contract,
      landPool: args.landPool,
      colorIdentity,
    });
    const basicKind = primaryBasic.basicKind;
    let currentBasics =
      basicKind === "swamp" || basicKind === "forest"
        ? countBasicCopies(deck, basicKind)
        : deck.lands.filter((land) => isBasicLandName(land.name)).reduce((s, l) => s + l.copies, 0);

    const nonBasicLands = [...deck.lands]
      .filter((land) => !isBasicLandName(land.name))
      .sort((a, b) => cutPriority(b.name, forcedCutNames) - cutPriority(a.name, forcedCutNames));

    while (currentBasics < basicTarget && nonBasicLands.length > 0) {
      const worst = nonBasicLands.find((land) => land.copies > 0);
      if (!worst) break;
      const swap = replaceLandWithEntry({
        deck,
        cutName: worst.name,
        addEntry: primaryBasic,
      });
      if (!swap) {
        worst.copies = 0;
        continue;
      }
      repairs.push(`basic density: ${swap}`);
      currentBasics += 1;
      if (worst.copies <= 0) {
        const idx = nonBasicLands.indexOf(worst);
        if (idx >= 0) nonBasicLands.splice(idx, 1);
      }
    }
  }

  deck.landCount = landCopies(deck);
  return { deck, repairs };
}

export function isLandBaseProfessorDefectV111(
  verdict: SolDirectedHeadProfessorWholeDeckVerdictV111,
): boolean {
  const landPattern =
    /\b(land base|mana base|basic[- ]heavy|basic forest|reliable black|reliable red|lotus vale|ziggurat|utility land|fetch|modal land|colorless-heavy|green-skewed|multicolor)\b/i;
  if (verdict.requiredChanges.some((change) => landPattern.test(change))) return true;
  if (verdict.offPlanCards.some((name) => HIGH_RISK_LAND_NAMES.some((risk) => risk.toLowerCase() === name.toLowerCase()))) {
    return true;
  }
  return false;
}
