/**
 * Build ProfessorPlanningContext v2 — includes frozen NO_ACTIONABLE fact IDs.
 */
import { buildCanonicalCommandZoneKnowledge } from "../../src/lib/deck-intelligence/canonical-knowledge-service";
import { searchMtgKnowledge } from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import type { ProfessorPlanningContext } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";
import type { ImplementedMechanismCatalogEntry } from "./phase6a1-implemented-mechanism-catalog-v1";
import type { FrozenOpportunityCase } from "./phase6a1-frozen-semantic-opportunity-v322-loader-v1";
import { formatBracketDevelopmentConstraint } from "./phase6a1-bracket-constraint-v1";

export const PROFESSOR_PLAN_CONTEXT_BUILDER_V2_VERSION = "phase6a1-professor-plan-context-builder-v2";

export async function buildProfessorPlanningContextV2(
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
    noActionableFactIds: oppCase.noActionableOpportunities.map((r) => r.factId),
    colorIdentity: entry.combinedColorIdentity,
    bracket: entry.bracket,
    userConstraints: [
      "SEMANTIC_ONLY experiment — no EDHREC/TopDeck/meta priors",
      "No BuildPath v3 gold strategy reference in planning",
      formatBracketDevelopmentConstraint(entry.bracket),
      "NO_ACTIONABLE facts are context only — do not create positive packages from them alone",
    ],
    initialRagEvidence: ragHits,
    initialResearchEvidence: [],
  };
}

export function listNoActionableFactIds(ctx: ProfessorPlanningContext): string[] {
  return ctx.noActionableFactIds;
}
