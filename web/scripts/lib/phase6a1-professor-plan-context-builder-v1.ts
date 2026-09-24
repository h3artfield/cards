/**
 * Build ProfessorPlanningContext from frozen mechanism facts + v3.2.2 opportunities.
 * SEMANTIC_ONLY — no BuildPath gold, no EDHREC/TopDeck research.
 */
import { buildCanonicalCommandZoneKnowledge } from "../../src/lib/deck-intelligence/canonical-knowledge-service";
import { searchMtgKnowledge } from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import type { ProfessorPlanningContext } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import type { ImplementedMechanismCatalogEntry } from "./phase6a1-implemented-mechanism-catalog-v1";
import type { FrozenOpportunityCase } from "./phase6a1-frozen-semantic-opportunity-v322-loader-v1";

export const PROFESSOR_PLAN_CONTEXT_BUILDER_V1_VERSION = "phase6a1-professor-plan-context-builder-v1";

export async function buildProfessorPlanningContext(
  entry: ImplementedMechanismCatalogEntry,
  oppCase: FrozenOpportunityCase,
  options?: { maxInitialEvidenceChunks?: number },
): Promise<ProfessorPlanningContext> {
  const canonical = buildCanonicalCommandZoneKnowledge(entry);
  const maxChunks = options?.maxInitialEvidenceChunks ?? 8;
  const initialRagEvidence = [];

  for (const commander of entry.commanders.slice(0, 2)) {
    const primer = await searchMtgKnowledge({
      query: `${commander} commander strategy enablers payoffs`,
      mode: "COMMANDER_PRIMER",
      consumer: "professor_planner",
      commanderName: commander,
      limit: Math.ceil(maxChunks / Math.max(entry.commanders.length, 1)),
    });
    initialRagEvidence.push(...primer.hits);
  }

  const strategy = await searchMtgKnowledge({
    query: `${entry.commanders.join(" ")} deckbuilding packages synergy`,
    mode: "PACKAGE",
    consumer: "professor_planner",
    limit: 4,
  });
  initialRagEvidence.push(...strategy.hits);

  const deduped = new Map(initialRagEvidence.map((h) => [h.chunkId, h]));
  const ragHits = [...deduped.values()].slice(0, maxChunks);

  return {
    caseId: entry.caseId,
    commandZone: {
      configuration: entry.commandZoneConfiguration,
      commanders: entry.commanders,
      combinedColorIdentity: entry.combinedColorIdentity,
      bracket: entry.bracket,
    },
    canonicalOracle: canonical.oracleEntries,
    commanderMechanismFacts: entry.independentMechanismFacts,
    semanticOpportunities: oppCase.opportunities,
    colorIdentity: entry.combinedColorIdentity,
    bracket: entry.bracket,
    userConstraints: [
      "SEMANTIC_ONLY experiment — no EDHREC/TopDeck/meta priors",
      "No BuildPath v3 gold strategy reference in planning",
      "Bracket-3 development benchmark",
    ],
    initialRagEvidence: ragHits,
    initialResearchEvidence: [],
  };
}

export function listFrozenFactIds(ctx: ProfessorPlanningContext): string[] {
  return ctx.commanderMechanismFacts.map((f) => f.mechanismId);
}

export function listFrozenOpportunityIds(ctx: ProfessorPlanningContext): string[] {
  return ctx.semanticOpportunities.map((o) => o.opportunityId);
}

export function listConstraintOpportunityIds(ctx: ProfessorPlanningContext): string[] {
  return ctx.semanticOpportunities
    .filter((o) => o.recordKind === "RISK_CONSTRAINT" || o.recordKind === "STATE_MAINTENANCE_CONSTRAINT")
    .map((o) => o.opportunityId);
}
