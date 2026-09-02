/**
 * RETRIEVAL — broad legal candidate pools per Sol requirement (no model call).
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { isCurrentlyCommanderLegal } from "../../../scripts/lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import {
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";
import { isCanonicalLandForDeckPartition } from "./professor-canonical-deck-partition-v1";
import type {
  DeckConstructionPlanV1,
  SolDirectedCandidatePoolV1,
} from "./professor-sol-directed-types-v1";
import type { CommanderBlueprintV417 } from "./professor-brew-blueprint-v4-17-v1";

export const PROFESSOR_SOL_DIRECTED_RETRIEVAL_V1_VERSION = "professor-sol-directed-retrieval-v1";

const DEFAULT_POOL_SIZE = 40;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function scoreCandidate(args: {
  oracleText: string;
  typeLine: string;
  requirementText: string;
  mechanics: string[];
}): number {
  const hay = `${args.oracleText} ${args.typeLine}`.toLowerCase();
  let score = 0;
  for (const token of tokenize(args.requirementText)) {
    if (hay.includes(token)) score += 2;
  }
  for (const mech of args.mechanics) {
    if (hay.includes(mech.toLowerCase())) score += 5;
  }
  return score;
}

function legalNonlandCorpus(args: {
  catalog: DeckResolutionCatalog;
  commanderColorIdentity: string[];
  excludeOracleIds: Set<string>;
}): Array<{ oracleId: string; scoreBase: number }> {
  const rows: Array<{ oracleId: string; scoreBase: number }> = [];
  for (const card of args.catalog.byOracleId.values()) {
    if (!isCurrentlyCommanderLegal(card)) continue;
    if (!commanderLegalInIdentity(card.colorIdentity ?? [], args.commanderColorIdentity)) continue;
    if (args.excludeOracleIds.has(card.oracleId)) continue;
    const truth = resolveCanonicalCardTruthV4164({ name: card.canonicalName, oracleId: card.oracleId, catalog: args.catalog });
    if (!cardTruthAllowsIntelligenceParticipation(truth)) continue;
    if (isCanonicalLandForDeckPartition(truth)) continue;
    rows.push({ oracleId: card.oracleId, scoreBase: 0 });
  }
  rows.sort((a, b) => a.oracleId.localeCompare(b.oracleId));
  return rows;
}

export function retrieveCandidatesForSolRequirementV1(args: {
  catalog: DeckResolutionCatalog;
  commander: CommanderBlueprintV417;
  requirement: DeckConstructionPlanV1["cardRequirements"][number];
  excludeOracleIds?: Set<string>;
  poolSize?: number;
}): SolDirectedCandidatePoolV1 {
  const poolSize = args.poolSize ?? DEFAULT_POOL_SIZE;
  const exclude = args.excludeOracleIds ?? new Set<string>();
  exclude.add(args.commander.oracleId);
  const requirementText = `${args.requirement.label} ${args.requirement.description} ${(args.requirement.requiredCharacteristics ?? []).join(" ")}`;
  const mechanics = args.requirement.mechanics ?? [];

  const scored = legalNonlandCorpus({
    catalog: args.catalog,
    commanderColorIdentity: args.commander.colorIdentity,
    excludeOracleIds: exclude,
  }).map((row) => {
    const card = args.catalog.byOracleId.get(row.oracleId)!;
    const oracleText = combinedGoldenOracleText(card);
    const score = scoreCandidate({
      oracleText,
      typeLine: card.typeLine ?? "",
      requirementText,
      mechanics,
    });
    return { oracleId: row.oracleId, score };
  });

  scored.sort(
    (a, b) => b.score - a.score || a.oracleId.localeCompare(b.oracleId),
  );

  const top = scored.filter((s) => s.score > 0).slice(0, poolSize);
  const fallback = top.length >= 12 ? top : scored.slice(0, poolSize);
  const recallQuality: SolDirectedCandidatePoolV1["recallQuality"] =
    top.length >= 20 ? "GOOD" : top.length >= 8 ? "THIN" : "POOR";

  return {
    requirementId: args.requirement.requirementId,
    label: args.requirement.label,
    recallQuality,
    candidates: fallback.map((row) => {
      const card = args.catalog.byOracleId.get(row.oracleId)!;
      return {
        oracleId: row.oracleId,
        name: card.canonicalName,
        truth: resolveCanonicalCardTruthV4164({
          name: card.canonicalName,
          oracleId: card.oracleId,
          catalog: args.catalog,
        }),
      };
    }),
  };
}

export function retrieveAllSolCandidatePoolsV1(args: {
  catalog: DeckResolutionCatalog;
  commander: CommanderBlueprintV417;
  plan: DeckConstructionPlanV1;
  poolSize?: number;
}): { pools: SolDirectedCandidatePoolV1[]; uniqueCandidateCount: number } {
  const byId = new Map<string, SolDirectedCandidatePoolV1["candidates"][number]>();
  const pools: SolDirectedCandidatePoolV1[] = [];

  for (const requirement of args.plan.cardRequirements ?? []) {
    if (!requirement?.requirementId || !requirement?.label) continue;
    const pool = retrieveCandidatesForSolRequirementV1({
      catalog: args.catalog,
      commander: args.commander,
      requirement,
      poolSize: args.poolSize,
    });
    pools.push(pool);
    for (const candidate of pool.candidates) {
      if (!byId.has(candidate.oracleId)) byId.set(candidate.oracleId, candidate);
    }
  }

  return { pools, uniqueCandidateCount: byId.size };
}

export function retrieveLandCandidatePoolV1(args: {
  catalog: DeckResolutionCatalog;
  commander: CommanderBlueprintV417;
  landTarget: number;
}): Array<{ oracleId: string; name: string; truth: ReturnType<typeof resolveCanonicalCardTruthV4164> }> {
  const lands: Array<{ oracleId: string; name: string; truth: ReturnType<typeof resolveCanonicalCardTruthV4164> }> = [];
  for (const card of args.catalog.byOracleId.values()) {
    if (!isCurrentlyCommanderLegal(card)) continue;
    if (!commanderLegalInIdentity(card.colorIdentity ?? [], args.commander.colorIdentity)) continue;
    const truth = resolveCanonicalCardTruthV4164({
      name: card.canonicalName,
      oracleId: card.oracleId,
      catalog: args.catalog,
    });
    if (!isCanonicalLandForDeckPartition(truth)) continue;
    lands.push({ oracleId: card.oracleId, name: card.canonicalName, truth });
  }
  lands.sort((a, b) => a.oracleId.localeCompare(b.oracleId));
  return lands.slice(0, Math.max(args.landTarget * 3, 120));
}
