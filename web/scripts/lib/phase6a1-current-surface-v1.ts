/**
 * Phase 6A.1 — Current retrieval surface evaluation helpers.
 */
import { createHash } from "node:crypto";
import type { FunctionalMatch, FunctionalMatchType } from "../../src/lib/deck-synthesis/functional-match-v1";
import type { RetrievalSpecification } from "../../src/lib/deck-synthesis/archetype-discovery-types-v1";
import type { SemanticCandidateV11 } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1.1";
import type { DeckResolutionCatalog } from "./load-deck-resolution-catalog";
import type { FunctionalSemanticRequirement, IndependentCandidateLabel } from "./phase6a-calibration-v2-types";
import { functionStratum, labelKey, type P14FunctionStratum } from "./phase6a1-p14-metrics-v1";

export type LabelSource = "FROZEN_271" | "FROZEN_240" | "UNLABELED";

export type FrozenLabelRecord = {
  label: IndependentCandidateLabel;
  packetId: string;
  specStatus: string | null;
  source: "FROZEN_271" | "FROZEN_240";
};

export type CurrentSurfaceTuple = {
  tupleId: string;
  caseId: string;
  requirementId: string;
  candidateOracleId: string;
  requirementRank: number;
  labelSource: LabelSource;
  humanLabel: IndependentCandidateLabel | null;
  requirementMateriallyChanged: boolean;
  linkedSpecFields: string[];
  functionStratum: P14FunctionStratum;
  semanticFamily: string;
};

export type SealedPostHocRecord = {
  tupleId: string;
  packetId: string;
  caseId: string;
  requirementId: string;
  candidateOracleId: string;
  requirementRank: number;
  rankOverall: number;
  rankForRequirement: number;
  generalCandidateScore: number;
  functionalRoleFit: number;
  bestMatchType: FunctionalMatchType;
  functionalMatch: FunctionalMatch | null;
  commanderSemanticFit: number;
  directionFit: number;
  structuralFit: number;
  falseExactFunctionClaim: boolean;
};

export function packetId(caseId: string, requirementId: string, candidateOracleId: string): string {
  return createHash("sha256").update(`${caseId}:${requirementId}:${candidateOracleId}`).digest("hex").slice(0, 16);
}

export function requirementSignature(req: FunctionalSemanticRequirement): string {
  return `${req.requirementId}|${[...req.linkedSpecFields].sort().join(",")}`;
}

export function buildMateriallyChangedRequirementSet(
  frozenReqs: FunctionalSemanticRequirement[],
  effectiveReqs: FunctionalSemanticRequirement[],
): Set<string> {
  const frozenSigs = new Map(frozenReqs.map((r) => [r.requirementId, requirementSignature(r)]));
  const changed = new Set<string>();
  for (const req of effectiveReqs) {
    const frozenSig = frozenSigs.get(req.requirementId);
    if (!frozenSig || frozenSig !== requirementSignature(req)) {
      changed.add(req.requirementId);
    }
  }
  return changed;
}

export function loadFrozenLabelMaps(input: {
  frozen271Packets: Array<{
    packetId: string;
    caseId: string;
    requirementId: string;
    candidateOracleId: string;
    independentReviewLabel: IndependentCandidateLabel | null;
    independentReviewSpecStatus?: string | null;
  }>;
  frozen240Packets: Array<{
    packetId: string;
    caseId: string;
    requirementId: string;
    candidateOracleId: string;
    independentReviewLabel: IndependentCandidateLabel | null;
    independentReviewSpecStatus?: string | null;
  }>;
}): {
  label271: Map<string, FrozenLabelRecord>;
  label240: Map<string, FrozenLabelRecord>;
} {
  const label271 = new Map<string, FrozenLabelRecord>();
  const label240 = new Map<string, FrozenLabelRecord>();

  for (const p of input.frozen271Packets) {
    if (!p.independentReviewLabel) continue;
    label271.set(labelKey(p.caseId, p.requirementId, p.candidateOracleId), {
      label: p.independentReviewLabel,
      packetId: p.packetId,
      specStatus: p.independentReviewSpecStatus ?? null,
      source: "FROZEN_271",
    });
  }
  for (const p of input.frozen240Packets) {
    if (!p.independentReviewLabel) continue;
    label240.set(labelKey(p.caseId, p.requirementId, p.candidateOracleId), {
      label: p.independentReviewLabel,
      packetId: p.packetId,
      specStatus: p.independentReviewSpecStatus ?? null,
      source: "FROZEN_240",
    });
  }
  return { label271, label240 };
}

export function resolveLabel(input: {
  caseId: string;
  requirementId: string;
  candidateOracleId: string;
  materiallyChanged: boolean;
  label271: Map<string, FrozenLabelRecord>;
  label240: Map<string, FrozenLabelRecord>;
}): { labelSource: LabelSource; humanLabel: IndependentCandidateLabel | null; frozenPacketId: string | null } {
  if (input.materiallyChanged) {
    return { labelSource: "UNLABELED", humanLabel: null, frozenPacketId: null };
  }
  const key = labelKey(input.caseId, input.requirementId, input.candidateOracleId);
  const from240 = input.label240.get(key);
  if (from240) return { labelSource: "FROZEN_240", humanLabel: from240.label, frozenPacketId: from240.packetId };
  const from271 = input.label271.get(key);
  if (from271) return { labelSource: "FROZEN_271", humanLabel: from271.label, frozenPacketId: from271.packetId };
  return { labelSource: "UNLABELED", humanLabel: null, frozenPacketId: null };
}

export function inferSemanticFamily(
  requirementId: string,
  linkedFields: string[],
  match: FunctionalMatch | null,
): string {
  const coarse = functionStratum(requirementId, linkedFields);
  if (coarse !== "other") return coarse;

  const blob = `${requirementId} ${linkedFields.join(" ")} ${match?.mechanism ?? ""} ${match?.requirementToken ?? ""}`.toLowerCase();
  if (blob.includes("sacrifice")) return "other:sacrifice_engine";
  if (blob.includes("enchantment")) return "other:enchantment_engine";
  if (blob.includes("spell_copy") || blob.includes("copy")) return "other:spell_copy_engine";
  if (blob.includes("combat")) return "other:combat_engine";
  if (blob.includes("tax") || blob.includes("punish")) return "other:spell_tax_engine";
  if (blob.includes("tutor")) return "other:tutor_engine";
  if (blob.includes("life")) return "other:life_engine";
  if (blob.includes("untap")) return "other:untap_engine";
  if (blob.includes("countermagic") || blob.includes("counter_magic")) return "other:countermagic";
  if (blob.includes("top_of_library") || blob.includes("library_top")) return "other:library_top_engine";
  if (blob.includes("damage")) return "other:damage_engine";
  if (blob.includes("prowess") || blob.includes("noncreature")) return "other:noncreature_spell_engine";
  if (blob.includes("experience")) return "other:experience_engine";
  if (blob.includes("connive") || blob.includes("convert")) return "other:transform_engine";
  return `other:${requirementId}`;
}

export function cardPresentation(catalog: DeckResolutionCatalog, oracleId: string) {
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

export function buildSealedPostHoc(input: {
  tuple: CurrentSurfaceTuple;
  candidate: SemanticCandidateV11;
  functionalMatch: FunctionalMatch | null;
}): SealedPostHocRecord {
  return {
    tupleId: input.tuple.tupleId,
    packetId: packetId(input.tuple.caseId, input.tuple.requirementId, input.tuple.candidateOracleId),
    caseId: input.tuple.caseId,
    requirementId: input.tuple.requirementId,
    candidateOracleId: input.tuple.candidateOracleId,
    requirementRank: input.tuple.requirementRank,
    rankOverall: input.candidate.rankOverall,
    rankForRequirement: input.candidate.rankForRequirement[input.tuple.requirementId] ?? input.tuple.requirementRank,
    generalCandidateScore: input.candidate.generalCandidateScore,
    functionalRoleFit: input.candidate.functionalRoleFit,
    bestMatchType: input.functionalMatch?.matchType ?? "NONE",
    functionalMatch: input.functionalMatch,
    commanderSemanticFit: input.candidate.commanderSemanticFit,
    directionFit: input.candidate.directionFit,
    structuralFit: input.candidate.structuralFit,
    falseExactFunctionClaim: input.candidate.falseExactFunctionClaim,
  };
}

export const STRONG_VALID_LABELS = new Set<IndependentCandidateLabel>(["STRONG_FIT", "VALID_ALTERNATIVE"]);
export const POSITIVE_LABELS = new Set<IndependentCandidateLabel>([
  "STRONG_FIT",
  "VALID_ALTERNATIVE",
  "WEAK_BUT_DEFENSIBLE",
]);
