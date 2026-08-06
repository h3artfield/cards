import type {
  StoreInventoryCard,
  StoreInventoryColorFilter,
} from "../../deck-builder/store-inventory-browse";
import {
  formatVerifiedCommanderAnswer,
  getVerifiedCommanderCandidates,
  parseCommanderSortFromQuestion,
  type CommanderCandidateSort,
  type VerifiedCommanderCandidate,
  type VerifiedCommanderCandidateAudit,
} from "./get-verified-commander-candidates";

export interface CommanderPick {
  card: StoreInventoryCard;
  commanderRank?: number;
  edhrecNumDecks?: number;
  colorIdentity: string[];
  typeLine?: string;
  reason: string;
}

export interface CommanderCandidateAudit {
  accepted: CommanderPick[];
  rejected: Array<{ name: string; oracleId?: string; reason: string }>;
  candidateCountBeforeFiltering?: number;
  themeKeywords?: string[];
  sort?: CommanderCandidateSort;
}

function toCommanderPick(v: VerifiedCommanderCandidate): CommanderPick {
  return {
    card: v.card,
    commanderRank: v.commanderRank,
    edhrecNumDecks: v.edhrecNumDecks,
    colorIdentity: v.colorIdentity,
    typeLine: v.typeLine,
    reason: v.reason,
  };
}

function auditFromVerified(audit: VerifiedCommanderCandidateAudit): CommanderCandidateAudit {
  return {
    accepted: audit.accepted.map(toCommanderPick),
    rejected: audit.rejected,
    candidateCountBeforeFiltering: audit.candidateCountBeforeFiltering,
    themeKeywords: audit.themeKeywords,
    sort: audit.sort,
  };
}

/** Same as discoverInStockCommanders but records rejection reasons for tracing/eval. */
export async function discoverInStockCommandersWithAudit(input: {
  storeId: string;
  storeSlug?: string;
  inventory?: StoreInventoryCard[];
  color: StoreInventoryColorFilter;
  maxPrice?: number;
  limit?: number;
  allowLiveEdhrec?: boolean;
  themeQuestion?: string;
  sort?: CommanderCandidateSort;
}): Promise<CommanderCandidateAudit> {
  const audit = await getVerifiedCommanderCandidates({
    storeId: input.storeId,
    storeSlug: input.storeSlug,
    inventory: input.inventory,
    colorFilter: input.color,
    inventoryOnly: true,
    maxPrice: input.maxPrice,
    sort: input.sort ?? "popularity",
    limit: input.limit ?? 10,
    themeQuestion: input.themeQuestion,
    allowLiveEdhrec: input.allowLiveEdhrec,
  });
  return auditFromVerified(audit);
}

/** Find in-stock commanders — delegates to canonical verified pipeline. */
export async function discoverInStockCommanders(input: {
  storeId: string;
  storeSlug?: string;
  inventory?: StoreInventoryCard[];
  color: StoreInventoryColorFilter;
  maxPrice?: number;
  limit?: number;
  allowLiveEdhrec?: boolean;
  themeQuestion?: string;
  sort?: CommanderCandidateSort;
}): Promise<CommanderPick[]> {
  const audit = await discoverInStockCommandersWithAudit(input);
  return audit.accepted;
}

export function formatCommanderPickAnswer(input: {
  picks: CommanderPick[];
  color: StoreInventoryColorFilter;
  maxPrice?: number;
  sort?: CommanderCandidateSort;
  themeKeywords?: string[];
}): string {
  const verified = input.picks.map((p) => ({
    ...p,
    oracleId: p.card.oracleId ?? "",
    structurallyEligible: true as const,
    themeScore: 0,
  }));
  return formatVerifiedCommanderAnswer({
    picks: verified,
    color: input.color,
    maxPrice: input.maxPrice,
    sort: input.sort ?? "popularity",
    themeKeywords: input.themeKeywords,
  });
}

export { getVerifiedCommanderCandidates, parseCommanderSortFromQuestion, formatVerifiedCommanderAnswer };
