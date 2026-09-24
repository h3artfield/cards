/**
 * Phase 6A calibration v2 — blinded reviewer packets + separate post-hoc scores.
 */
import { createHash } from "node:crypto";
import type { SemanticCandidate } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";
import type { CommanderBuildDirection, RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import type { DeckResolutionCatalog } from "./load-deck-resolution-catalog";
import type { ShadowSemanticIndex } from "../../src/lib/commander-strategy/shadow-semantic-index";
import { compositeCandidateScore, rankCandidates } from "./phase6a-human-retrieval-adjudication-v1";
import type { CommanderBracket } from "../../src/lib/bracket-policy/bracket-policy-v1";
import type {
  BlindedReviewPacket,
  FunctionalSemanticRequirement,
  PostHocScoreRecord,
} from "./phase6a-calibration-v2-types";
import { candidatesMatchingRequirement } from "./phase6a-calibration-v2-functional-recall";

const PACKETS_PER_REQUIREMENT = 5;

function packetId(caseId: string, requirementId: string, candidateOracleId: string): string {
  return createHash("sha256").update(`${caseId}:${requirementId}:${candidateOracleId}`).digest("hex").slice(0, 16);
}

function cardPresentation(catalog: DeckResolutionCatalog, oracleId: string) {
  const card = catalog.byOracleId.get(oracleId);
  return {
    canonicalName: card?.canonicalName ?? oracleId,
    manaCost: card?.manaCost ?? null,
    manaValue: card?.manaValue ?? null,
    typeLine: card?.typeLine ?? "",
    oracleText: card?.oracleText ?? "",
    power: card?.power ?? null,
    toughness: card?.toughness ?? null,
    colorIdentity: card?.colorIdentity ?? [],
  };
}

function commandZoneOracleTexts(
  catalog: DeckResolutionCatalog,
  commanderOracleIds: string[],
  commanderNames: string[],
): Array<{ name: string; oracleText: string }> {
  return commanderOracleIds.map((id, idx) => ({
    name: catalog.byOracleId.get(id)?.canonicalName ?? commanderNames[idx] ?? id,
    oracleText: catalog.byOracleId.get(id)?.oracleText ?? "",
  }));
}

/** Score-independent deterministic sample: sort by canonical name, take spread. */
function sampleCandidatesForRequirement(candidates: SemanticCandidate[], catalog: DeckResolutionCatalog): SemanticCandidate[] {
  const sorted = [...candidates].sort((a, b) => {
    const na = catalog.byOracleId.get(a.oracleId)?.canonicalName ?? a.canonicalName;
    const nb = catalog.byOracleId.get(b.oracleId)?.canonicalName ?? b.canonicalName;
    return na.localeCompare(nb);
  });
  if (sorted.length <= PACKETS_PER_REQUIREMENT) return sorted;
  const picked = new Set<string>();
  const out: SemanticCandidate[] = [];
  const add = (c: SemanticCandidate) => {
    if (picked.has(c.oracleId)) return;
    picked.add(c.oracleId);
    out.push(c);
  };
  add(sorted[0]!);
  add(sorted[1]!);
  add(sorted[Math.floor(sorted.length / 2)]!);
  add(sorted[sorted.length - 2]!);
  add(sorted[sorted.length - 1]!);
  return out.slice(0, PACKETS_PER_REQUIREMENT);
}

function sampleTierFromRank(rank: number, poolSize: number): "TOP" | "MIDDLE" | "TAIL" {
  if (rank <= 5) return "TOP";
  if (rank >= poolSize - 4) return "TAIL";
  return "MIDDLE";
}

export function buildBlindedReviewArtifacts(input: {
  caseId: string;
  commanders: string[];
  commanderOracleIds: string[];
  commandZoneConfiguration: string;
  combinedColorIdentity: string[];
  bracket: CommanderBracket;
  primary: CommanderBuildDirection;
  requirements: FunctionalSemanticRequirement[];
  candidates: SemanticCandidate[];
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
  automatedProxyLabels?: Map<string, string>;
}): { blindedPackets: BlindedReviewPacket[]; postHocScores: PostHocScoreRecord[] } {
  const ranked = rankCandidates(input.candidates);
  const rankByOracle = new Map(ranked.map((c, i) => [c.oracleId, i + 1]));
  const blindedPackets: BlindedReviewPacket[] = [];
  const postHocScores: PostHocScoreRecord[] = [];
  const memberTexts = commandZoneOracleTexts(input.catalog, input.commanderOracleIds, input.commanders);

  for (const requirement of input.requirements) {
    const matching = candidatesMatchingRequirement({
      requirement,
      candidates: input.candidates,
      catalog: input.catalog,
      shadowIndex: input.shadowIndex,
    });
    const sampled = sampleCandidatesForRequirement(matching.length ? matching : input.candidates.slice(0, PACKETS_PER_REQUIREMENT), input.catalog);

    for (const candidate of sampled) {
      const id = packetId(input.caseId, requirement.requirementId, candidate.oracleId);
      const rankOverall = rankByOracle.get(candidate.oracleId) ?? ranked.length;

      blindedPackets.push({
        packetId: id,
        caseId: input.caseId,
        requirementId: requirement.requirementId,
        candidateOracleId: candidate.oracleId,
        reviewContext: {
          commandZoneConfiguration: input.commandZoneConfiguration,
          commandZoneMemberOracleTexts: memberTexts,
          combinedColorIdentity: input.combinedColorIdentity,
          bracket: input.bracket,
          frozenMechanicalDirection: input.primary.mechanicalDescription,
          requirement: {
            requirementId: requirement.requirementId,
            description: requirement.description,
            linkedSpecFields: requirement.linkedSpecFields,
          },
          candidate: cardPresentation(input.catalog, candidate.oracleId),
        },
        independentReviewLabel: null,
        independentReviewNotes: null,
        reviewStatus: "PENDING_INDEPENDENT_REVIEW",
      });

      postHocScores.push({
        packetId: id,
        caseId: input.caseId,
        requirementId: requirement.requirementId,
        candidateOracleId: candidate.oracleId,
        compositeScore: compositeCandidateScore(candidate),
        rankOverall,
        commanderSemanticFit: candidate.commanderSemanticFit,
        directionFit: candidate.directionFit,
        functionalRoleFit: candidate.functionalRoleFit,
        structuralFit: candidate.structuralFit,
        automatedProxyLabel: input.automatedProxyLabels?.get(candidate.oracleId) ?? null,
        sampleTier: sampleTierFromRank(rankOverall, ranked.length),
        note: "Post-hoc analysis only — not visible to independent reviewer.",
      });
    }
  }

  return { blindedPackets, postHocScores };
}

export function outputProvenanceMetaAudit(candidates: SemanticCandidate[]): {
  auditType: "OUTPUT_PROVENANCE_META_AUDIT";
  candidatesUsingMetaSignal: number;
  edhrecAccessed: number;
  decklistMembershipSignal: number;
  coOccurrenceSignal: number;
  popularitySignal: number;
  pass: boolean;
  limitation: string;
} {
  const forbidden = ["edhrec", "decklist", "co-occurrence", "cooccurrence", "popularity", "meta_prior", "meta-prior"];
  let violations = 0;
  for (const c of candidates) {
    const blob = JSON.stringify({
      positive: c.positiveSignals,
      negative: c.negativeSignals,
      evidence: c.evidenceRefs,
      why: c.whyCandidate,
      source: c.retrievalSource,
    }).toLowerCase();
    if (c.retrievalSource !== "SEMANTIC_ONLY") violations += 1;
    if (forbidden.some((f) => blob.includes(f))) violations += 1;
  }
  return {
    auditType: "OUTPUT_PROVENANCE_META_AUDIT",
    candidatesUsingMetaSignal: violations,
    edhrecAccessed: 0,
    decklistMembershipSignal: 0,
    coOccurrenceSignal: 0,
    popularitySignal: 0,
    pass: violations === 0,
    limitation:
      "Scans candidate output/provenance strings only — not proof that upstream SEMANTIC_ONLY execution context excluded meta-data providers.",
  };
}
