/**
 * Deterministic 99-card slot repair after Constructor / Critic output.
 */
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import { basicLandColorIdentity, isBasicLandName } from "./professor-commander-legality-v4-9-v1";
import { normalizeCardNameForMatch } from "./professor-canonical-card-identity-v4-15-1-v1";
import type {
  LandPoolV11,
  RetrievalContractV11,
  SolDirectedConstructedDeckV11,
} from "./professor-sol-directed-types-v1-1";

export const PROFESSOR_SOL_DIRECTED_DECK_COUNT_REPAIR_V1_1_1_VERSION =
  "professor-sol-directed-deck-count-repair-v1-1-1";

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

function basicLandPreferenceScore(entry: LandPoolV11["entries"][number], identity: string[]): number {
  if (!entry.isBasic) return -1;
  const kind = entry.basicKind;
  if (kind === "forest" && identity.includes("G")) return 100;
  if (kind === "swamp" && identity.includes("B")) return 100;
  if (entry.name === "Plains" && identity.includes("W")) return 100;
  if (entry.name === "Island" && identity.includes("U")) return 100;
  if (entry.name === "Mountain" && identity.includes("R")) return 100;
  if (entry.name === "Wastes") return 10;
  return 0;
}

function remainingLandCapacity(
  deck: SolDirectedConstructedDeckV11,
  entry: LandPoolV11["entries"][number],
): number {
  const current =
    deck.lands.find((land) => normalizeCardNameForMatch(land.name) === normalizeCardNameForMatch(entry.name))
      ?.copies ?? 0;
  return Math.max(0, entry.maxCopies - current);
}

function addLandCopies(args: {
  deck: SolDirectedConstructedDeckV11;
  landPool: LandPoolV11;
  copies: number;
  colorIdentity: string[];
  ignoreMaxCopies?: boolean;
}): number {
  let added = 0;
  const candidates = [...args.landPool.entries]
    .filter(
      (entry) =>
        entry.isBasic &&
        entry.maxCopies > 0 &&
        commanderLegalInIdentity(basicLandColorIdentity(entry.name), args.colorIdentity),
    )
    .sort(
      (a, b) =>
        basicLandPreferenceScore(b, args.colorIdentity) - basicLandPreferenceScore(a, args.colorIdentity) ||
        remainingLandCapacity(args.deck, b) - remainingLandCapacity(args.deck, a),
    );

  for (const entry of candidates) {
    if (added >= args.copies) break;
    const room = args.ignoreMaxCopies
      ? args.copies - added
      : remainingLandCapacity(args.deck, entry);
    if (room <= 0) continue;
    const delta = Math.min(args.copies - added, room);
    const row = args.deck.lands.find(
      (land) => normalizeCardNameForMatch(land.name) === normalizeCardNameForMatch(entry.name),
    );
    if (row) row.copies += delta;
    else args.deck.lands.push({ name: entry.name, copies: delta });
    added += delta;
  }

  return added;
}

function removeLandCopies(deck: SolDirectedConstructedDeckV11, copies: number): number {
  let removed = 0;
  const ordered = [...deck.lands].sort((a, b) => {
    const aBasic = isBasicLandName(a.name) ? 0 : 1;
    const bBasic = isBasicLandName(b.name) ? 0 : 1;
    return bBasic - aBasic || b.copies - a.copies;
  });

  for (const land of ordered) {
    if (removed >= copies) break;
    const row = deck.lands.find((entry) => entry.name === land.name);
    if (!row) continue;
    const minKeep = isBasicLandName(row.name) ? 0 : 1;
    const delta = Math.min(copies - removed, Math.max(0, row.copies - minKeep));
    if (delta <= 0) continue;
    row.copies -= delta;
    removed += delta;
  }

  deck.lands = deck.lands.filter((land) => land.copies > 0);
  return removed;
}

function trimNonlands(deck: SolDirectedConstructedDeckV11, count: number): number {
  let removed = 0;
  const flexIndices = deck.nonlands
    .map((card, index) => ({ index, flex: card.structuralNecessity === "FLEX" }))
    .filter((entry) => entry.flex)
    .map((entry) => entry.index)
    .reverse();

  for (const index of flexIndices) {
    if (removed >= count) break;
    deck.nonlands.splice(index, 1);
    removed++;
  }

  while (removed < count && deck.nonlands.length > 0) {
    deck.nonlands.pop();
    removed++;
  }

  return removed;
}

export function repairSolDirectedConstructedDeckCountsV111(args: {
  deck: SolDirectedConstructedDeckV11;
  contract: RetrievalContractV11;
  landPool: LandPoolV11;
}): { deck: SolDirectedConstructedDeckV11; repairs: string[] } {
  const repairs: string[] = [];
  const deck: SolDirectedConstructedDeckV11 = {
    ...args.deck,
    lands: mergeLandRows(args.deck.lands),
    nonlands: [...args.deck.nonlands],
  };

  const requiredNonlands = args.contract.nonlandSlotsRequired;
  const requiredLands = args.contract.landSlotsRequired;
  const colorIdentity = args.deck.commander.colorIdentity;

  let nonlandCount = deck.nonlands.length;
  let landCount = landCopies(deck);

  if (nonlandCount > requiredNonlands) {
    const removed = trimNonlands(deck, nonlandCount - requiredNonlands);
    if (removed > 0) {
      repairs.push(`trimmed ${removed} nonland(s) → ${requiredNonlands}`);
      nonlandCount = deck.nonlands.length;
    }
  }

  landCount = landCopies(deck);
  if (landCount < requiredLands) {
    const added = addLandCopies({
      deck,
      landPool: args.landPool,
      copies: requiredLands - landCount,
      colorIdentity,
      ignoreMaxCopies: true,
    });
    if (added > 0) {
      repairs.push(`added ${added} basic land copy/copies → ${requiredLands} lands`);
      landCount = landCopies(deck);
    }
  }

  if (landCount > requiredLands) {
    const removed = removeLandCopies(deck, landCount - requiredLands);
    if (removed > 0) {
      repairs.push(`removed ${removed} land copy/copies → ${requiredLands} lands`);
      landCount = landCopies(deck);
    }
  }

  const total = nonlandCount + landCount;
  if (total < 99 && landCount < requiredLands) {
    const added = addLandCopies({
      deck,
      landPool: args.landPool,
      copies: 99 - total,
      colorIdentity,
      ignoreMaxCopies: true,
    });
    if (added > 0) repairs.push(`topped up ${added} land copy/copies to reach 99 cards`);
  }

  deck.landCount = landCopies(deck);
  return { deck, repairs };
}
