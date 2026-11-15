/**
 * Convert v2 mechanism catalog slots into StrategyHypothesis layer with explicit provenance.
 * v2 catalog is DEVELOPMENTAL — all hypotheses remain PENDING_INDEPENDENT_SEMANTIC_ADJUDICATION.
 */
import type { RetrievalBucketId } from "../../src/lib/deck-synthesis/semantic-candidate-retrieval-v1";
import type {
  BridgeHypothesis,
  IndependentEngineHypothesis,
  SemanticEvidence,
  SemanticSlotRef,
  StrategyHypothesisEntry,
} from "../../src/lib/deck-synthesis/build-path-semantic-types-v3";
import type { CommanderMechanismFactsEntry } from "../../src/lib/deck-synthesis/build-path-semantic-types-v3";
import {
  COMMANDER_MECHANISM_CATALOG,
  type BridgeSlot,
  type CommanderMechanismEntry,
  type MechanismSlot,
} from "./phase6a1-commander-mechanism-catalog-v2";
import { looksLikeStrategyAssertion, validateOracleEvidence } from "./phase6a1-semantic-evidence-v3";
import type { CommanderCaseContext } from "./phase6a1-commander-case-context-v1";

export const STRATEGY_HYPOTHESIS_V1_VERSION = "phase6a1-strategy-hypothesis-v1";

function classifyEvidence(raw: string, oracleTexts: CommanderCaseContext["commanderOracleTexts"]): SemanticEvidence {
  if (looksLikeStrategyAssertion(raw)) {
    return { type: "STRATEGY_HYPOTHESIS", rationale: raw };
  }
  const asOracle: SemanticEvidence = {
    type: "COMMANDER_ORACLE",
    oracleSpan: raw,
  };
  const check = validateOracleEvidence(asOracle, oracleTexts);
  if (check.valid) return asOracle;
  return { type: "DERIVED_CAUSAL_INFERENCE", rationale: raw };
}

function slotToRef(
  slot: MechanismSlot | BridgeSlot,
  oracleTexts: CommanderCaseContext["commanderOracleTexts"],
): SemanticSlotRef {
  return {
    targetMechanic: slot.targetMechanic,
    linkedSpecField: slot.linkedSpecField,
    retrievalToken: slot.retrievalToken,
    retrievalBucket: slot.retrievalBucket,
    causalRole: slot.causalRole,
    matchConstraints: slot.matchConstraints,
    evidence: classifyEvidence(slot.oracleEvidence, oracleTexts),
  };
}

function inferCausalRelation(enabler: SemanticSlotRef, payoff: SemanticSlotRef): string {
  return `${enabler.retrievalToken} → state/resource change → ${payoff.retrievalToken}`;
}

function buildIndependentEngine(
  caseId: string,
  entry: CommanderMechanismEntry,
  oracleTexts: CommanderCaseContext["commanderOracleTexts"],
): IndependentEngineHypothesis[] {
  const { enabler, payoff } = entry.independentEngine;
  return [
    {
      hypothesisId: `${caseId}--independent-engine-0`,
      enabler: slotToRef(enabler, oracleTexts),
      causalRelation: inferCausalRelation(slotToRef(enabler, oracleTexts), slotToRef(payoff, oracleTexts)),
      payoff: slotToRef(payoff, oracleTexts),
      worksWithoutCommander: true,
      colorIdentityLegal: null,
      causalDefense: entry.functionWithoutCommander,
      hypothesisProvenance:
        enabler.oracleEvidence === payoff.oracleEvidence ? "STRATEGY_HYPOTHESIS" : "DERIVED_CAUSAL_INFERENCE",
      adjudicationStatus: "PENDING_INDEPENDENT_SEMANTIC_ADJUDICATION",
    },
  ];
}

function buildBridges(
  caseId: string,
  entry: CommanderMechanismEntry,
  oracleTexts: CommanderCaseContext["commanderOracleTexts"],
): BridgeHypothesis[] {
  return entry.bridges.map((b, idx) => ({
    hypothesisId: `${caseId}--bridge-${idx}`,
    label: b.label,
    candidateMechanic: slotToRef(b, oracleTexts),
    commanderSideJob: {
      description: b.commanderJob,
      commanderMechanismFactIds: [],
      causalProof: b.commanderJob,
      evidence: classifyEvidence(b.oracleEvidence, oracleTexts),
    },
    independentSideJob: {
      description: b.independentJob,
      independentEngineHypothesisId: `${caseId}--independent-engine-0`,
      causalProof: b.independentJob,
      evidence: { type: "STRATEGY_HYPOTHESIS", rationale: b.independentJob },
    },
    adjudicationStatus: "PENDING_INDEPENDENT_SEMANTIC_ADJUDICATION",
  }));
}

export function buildStrategyHypothesisEntry(
  ctx: CommanderCaseContext,
  v2Entry: CommanderMechanismEntry | undefined,
): StrategyHypothesisEntry | null {
  if (!v2Entry) return null;

  const oracleTexts = ctx.commanderOracleTexts;

  return {
    caseId: ctx.caseId,
    commanders: ctx.commanders,
    dependentInputs: v2Entry.commanderInputs.map((s) => slotToRef(s, oracleTexts)),
    dependentOutputExploits: v2Entry.commanderOutputExploits.map((s) => slotToRef(s, oracleTexts)),
    independentEngines: buildIndependentEngine(ctx.caseId, v2Entry, oracleTexts),
    bridgeHypotheses: buildBridges(ctx.caseId, v2Entry, oracleTexts),
    failureWithoutCommander: v2Entry.failureWithoutCommander,
    functionWithoutCommander: v2Entry.functionWithoutCommander,
    adjudicationStatus: "PENDING_INDEPENDENT_SEMANTIC_ADJUDICATION",
  };
}

export function buildStrategyHypothesisCatalog(
  contexts: CommanderCaseContext[],
): StrategyHypothesisEntry[] {
  const byCase = new Map(COMMANDER_MECHANISM_CATALOG.map((e) => [e.caseId, e]));
  return contexts
    .map((ctx) => buildStrategyHypothesisEntry(ctx, byCase.get(ctx.caseId)))
    .filter((e): e is StrategyHypothesisEntry => e !== null);
}

export function getV2CatalogEntry(caseId: string): CommanderMechanismEntry | undefined {
  return COMMANDER_MECHANISM_CATALOG.find((e) => e.caseId === caseId);
}

export function v2OracleSummary(caseId: string): string | null {
  return getV2CatalogEntry(caseId)?.oracleSummary ?? null;
}

/** Link bridge commander jobs to extracted mechanism fact IDs where span matches. */
export function linkBridgeFactsToMechanisms(
  facts: CommanderMechanismFactsEntry,
  bridges: BridgeHypothesis[],
): BridgeHypothesis[] {
  const allFacts = facts.memberFacts.flatMap((m) => m.mechanisms);
  return bridges.map((b) => {
    const matched = allFacts
      .filter((f) => {
        const span = b.commanderSideJob.evidence.oracleSpan ?? b.candidateMechanic.evidence.oracleSpan ?? "";
        return span && f.evidenceSpan.toLowerCase().includes(span.toLowerCase().slice(0, 20));
      })
      .map((f) => f.factId);
    return {
      ...b,
      commanderSideJob: { ...b.commanderSideJob, commanderMechanismFactIds: matched },
    };
  });
}

/** Token → expected bucket for pre-Gate-B compatibility audit. */
export const RETRIEVAL_TOKEN_BUCKET_MAP: Record<string, RetrievalBucketId> = {
  ramp: "MANA_SUPPORT",
  mana_generation: "MANA_SUPPORT",
  card_draw: "CARD_ADVANTAGE",
  combat_payoff: "PAYOFFS",
  token_generation: "ENGINE_PIECES",
  mill: "STRUCTURAL_SUPPORT",
  mill_target_player: "STRUCTURAL_SUPPORT",
  reanimation: "RECURSION",
  recursion: "RECURSION",
  graveyard_setup: "STATE_BUILDERS",
  sacrifice_outlet: "RESOURCE_CONSUMERS",
  untap_support: "ENABLERS",
  goblins_controlled: "ENGINE_PIECES",
};

export function expectedBucketForToken(token: string): RetrievalBucketId | null {
  return RETRIEVAL_TOKEN_BUCKET_MAP[token] ?? null;
}

export function mechanicTokenMismatch(slot: SemanticSlotRef): boolean {
  const mechanic = slot.targetMechanic.toLowerCase();
  const token = slot.retrievalToken.toLowerCase();

  if (token === "combat_payoff" && (mechanic.includes("mana") || mechanic.includes("x spell"))) return true;
  if (token === "card_draw" && mechanic.includes("combat") && !mechanic.includes("draw")) return true;
  if (token === "ramp" && mechanic.includes("draw") && !mechanic.includes("mana")) return true;
  if (token === "reanimation" && mechanic.includes("counter") && !mechanic.includes("graveyard")) return true;
  if (token === "creature_from_library_top" && mechanic.includes("combat")) return true;
  if (token === "combat_payoff" && mechanic.includes("library")) return true;

  const expected = expectedBucketForToken(token);
  if (!expected) return false;
  return slot.retrievalBucket !== expected;
}
