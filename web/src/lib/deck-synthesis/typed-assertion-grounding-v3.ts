/**
 * Typed strategic assertion grounding — primary Professor v3 validation authority.
 */
import type { IndependentMechanismFact } from "./independent-truth-types-v1";
import type { SemanticOpportunity } from "./semantic-opportunity-types-v1";
import type { EvidenceRef } from "./professor-planning-evidence-v3";
import type {
  AssertionPredicateV3,
  CausalEdgeV3,
  StrategicAssertionV3,
} from "./strategic-assertion-vocabulary-v3";
import {
  CANONICAL_MECHANICAL_PREDICATES_V3,
  CONSUMER_PREDICATES_V3,
  normalizeStrategicAssertionV3,
  PRODUCER_PREDICATES_V3,
} from "./strategic-assertion-vocabulary-v3";
import type { ProfessorEvidenceLedgerEntryV3, ProfessorEvidenceLedgerV3 } from "./professor-v3-evidence-ledger-v1";
import { ledgerEntryById, ledgerRulesEntryByRuleId } from "./professor-v3-evidence-ledger-v1";
import type { ProfessorPlanningContextV3, SemanticRelationshipV3 } from "./professor-planning-contracts-v3";
import { buildProfessorEvidenceLedgerV3 } from "./professor-v3-evidence-ledger-v1";
import {
  canonicalStatesFromMechanismFact,
  deriveProducerConsumerBridgeCompatible,
  flattenMechanismActions,
  MECHANICAL_STATE_HINT,
  normalizedResourcesFromPermanentSubtype,
  requiredStatesFromMechanismFact,
  tokenDescriptorMatchesAssertionObject,
  triggerSupportsTriggersOnAssertion,
  tryDeriveGameStateProof,
  tryDeriveMechanicalAssertionProof,
  tryDerivePermitsActionFromMechanismProof,
} from "./grounding-derivation-graph-v1";

export const TYPED_ASSERTION_GROUNDING_V3_VERSION = "typed-assertion-grounding-v3";

export type AssertionGroundingIssueV3 = {
  code: string;
  message: string;
  assertionId?: string;
  edgeId?: string;
};

export type AssertionResolverContextV3 = {
  mechanismFacts: IndependentMechanismFact[];
  knownMechanicalAffordances: SemanticOpportunity[];
  semanticRelationships: SemanticRelationshipV3[];
  oracleEntries: ProfessorPlanningContextV3["canonicalOracle"];
  ledger: ProfessorEvidenceLedgerV3;
  researchById: Map<string, { summary: string }>;
};

function actionList(fact: IndependentMechanismFact): Array<Record<string, unknown>> {
  return Array.isArray(fact.actions) ? (fact.actions as Array<Record<string, unknown>>) : [];
}

function actionType(action: Record<string, unknown>): string {
  return String(action.type ?? "").toUpperCase();
}

function tokenText(action: Record<string, unknown>): string {
  return String(action.token ?? action.object ?? "").toLowerCase();
}

function producedStatesFromAction(fact: IndependentMechanismFact, action: Record<string, unknown>): Set<string> {
  const states = new Set<string>();
  const type = actionType(action);
  if (type === "CREATE_TOKEN") {
    const token = tokenText(action);
    if (token.includes("treasure")) states.add("TREASURE_TOKENS");
    else if (token.includes("hydra")) {
      states.add("HYDRA_TOKENS");
      states.add("CREATURE_TOKENS");
    } else if (token.includes("elemental")) {
      states.add("ELEMENTAL_TOKENS");
      states.add("CREATURE_TOKENS");
    } else if (token.includes("creature")) states.add("CREATURE_TOKENS");
  }
  if (type === "PUT_COUNTER") {
    states.add("COUNTER_SCALING");
    if (String(action.quantity ?? "").includes("X")) states.add("X_COUNTERS");
  }
  if (type === "ADD_MANA") states.add("MANA");
  if (type === "DEAL_DAMAGE") states.add("DAMAGE");
  if (type === "DRAW_CARD") states.add("CARD_ADVANTAGE");
  if (type === "LOSE_LIFE") states.add("LIFE_LOSS");
  if (type === "REVEAL") states.add("REVEALED_CARD");
  if (type === "ZONE_MOVE" && String(action.to ?? "").toUpperCase() === "HAND") states.add("CARD_IN_HAND");
  if (type === "GRANT_PLAY_PERMISSION" || type === "PLAY_FROM_EXILE" || type === "CAST_FROM_EXILE") {
    states.add("EXILE_PLAYABLE_CARDS");
  }
  if (type === "MILL" || (type === "MOVE_CARDS" && String(action.zone ?? action.destinationZone ?? action.to ?? "").toUpperCase() === "GRAVEYARD")) {
    if (millOrMoveTargetsControllerStock(fact, action)) states.add("GRAVEYARD_PERMANENTS");
  }
  if (type === "ZONE_MOVE" && String(action.to ?? "").toUpperCase() === "EXILE") {
    if (actionList(fact).some((a) => actionType(a) === "GRANT_PLAY_PERMISSION")) states.add("EXILE_PLAYABLE_CARDS");
  }
  return states;
}

function millOrMoveTargetsControllerStock(fact: IndependentMechanismFact, action: Record<string, unknown>): boolean {
  const target = String(action.target ?? action.object ?? action.from ?? fact.subject ?? "YOUR_LIBRARY").toUpperCase();
  if (target.includes("OPPONENT")) return false;
  return target.includes("YOUR") || target.includes("CONTROLLER") || target.includes("LIBRARY");
}

function producedStatesFromFact(fact: IndependentMechanismFact): Set<string> {
  return canonicalStatesFromMechanismFact(fact);
}

function requiredStatesFromFact(fact: IndependentMechanismFact): Set<string> {
  return requiredStatesFromMechanismFact(fact);
}

function consumedStatesFromFact(fact: IndependentMechanismFact): Set<string> {
  const states = new Set<string>();
  for (const action of flattenMechanismActions(fact)) {
    const type = actionType(action);
    if (type === "CAST_FROM_GRAVEYARD" || type === "PLAY_FROM_GRAVEYARD") states.add("GRAVEYARD_PERMANENTS");
    if (type === "SACRIFICE") {
      states.add("SACRIFICE_FODDER");
      for (const state of normalizedResourcesFromPermanentSubtype(String(action.permanentSubtype ?? ""))) states.add(state);
    }
  }
  return states;
}

function stateEntailedBySingleFact(assertion: StrategicAssertionV3, fact: IndependentMechanismFact): boolean {
  const state = assertion.resourceOrState;
  if (!state) return false;
  const produced = producedStatesFromFact(fact);
  const required = requiredStatesFromFact(fact);
  const consumed = consumedStatesFromFact(fact);
  if (assertion.predicate === "PRODUCES_STATE") return produced.has(state);
  if (assertion.predicate === "REQUIRES_STATE") return required.has(state);
  if (assertion.predicate === "CONSUMES_STATE") return consumed.has(state);
  return false;
}

function stateEntailedByMechanismFacts(
  assertion: StrategicAssertionV3,
  facts: IndependentMechanismFact[],
): boolean {
  return facts.some((fact) => stateEntailedBySingleFact(assertion, fact));
}

function ragProducesState(text: string, state: string): boolean {
  const blob = text.toLowerCase();
  const norm = state.toLowerCase().replace(/_/g, " ");
  if (state === "GRAVEYARD_PERMANENTS") return blob.includes("self-mill") || (blob.includes("mill") && !blob.includes("opponent"));
  if (state === "TREASURE_TOKENS") return blob.includes("treasure");
  if (state === "EXILE_PLAYABLE_CARDS") return blob.includes("exile") && (blob.includes("play") || blob.includes("cast"));
  if (state === "HYDRA_TOKENS") return blob.includes("hydra");
  if (state === "CREATURE_TOKENS") return blob.includes("creature") && blob.includes("token");
  if (state === "X_COUNTERS" || state === "COUNTER_SCALING") return blob.includes("counter") || blob.includes("{x}");
  if (state === "ELEMENTAL_TOKENS") return blob.includes("elemental") && blob.includes("token");
  if (state === "DAMAGE") return blob.includes("damage");
  if (state === "CARD_ADVANTAGE") return blob.includes("draw") && blob.includes("card");
  if (state === "SACRIFICE_FODDER") return blob.includes("sacrifice");
  return norm.split(" ").every((w) => w.length <= 3 || blob.includes(w));
}

function ragRequiresState(text: string, state: string): boolean {
  return ragProducesState(text, state);
}

function stateEntailedByOracle(assertion: StrategicAssertionV3, oracleText: string): boolean {
  const state = assertion.resourceOrState;
  if (!state || assertion.predicate !== "PRODUCES_STATE") return false;
  const blob = oracleText.toLowerCase();
  if (state === "HYDRA_TOKENS") return blob.includes("hydra") && blob.includes("token");
  if (state === "X_COUNTERS") return blob.includes("counter") && blob.includes("{x}");
  if (state === "ELEMENTAL_TOKENS") return blob.includes("elemental") && blob.includes("token");
  if (state === "DAMAGE") return blob.includes("deals") && blob.includes("damage");
  if (state === "TREASURE_TOKENS") return blob.includes("treasure");
  if (state === "EXILE_PLAYABLE_CARDS") return blob.includes("exile") && blob.includes("play");
  return false;
}

function stateRelationshipEntailed(
  assertion: StrategicAssertionV3,
  args: { facts?: IndependentMechanismFact[]; oracleText?: string; ragText?: string },
): boolean {
  const state = assertion.resourceOrState;
  if (!state) return false;
  if (args.facts?.length && stateEntailedByMechanismFacts(assertion, args.facts)) return true;
  if (args.oracleText && stateEntailedByOracle(assertion, args.oracleText)) return true;
  if (args.ragText) {
    if (assertion.predicate === "PRODUCES_STATE") return ragProducesState(args.ragText, state);
    if (assertion.predicate === "REQUIRES_STATE" || assertion.predicate === "CONSUMES_STATE") {
      return ragRequiresState(args.ragText, state);
    }
  }
  return false;
}

function factMap(ctx: AssertionResolverContextV3): Map<string, IndependentMechanismFact> {
  return new Map(ctx.mechanismFacts.map((f) => [f.mechanismId, f]));
}

function normalizeForSpanMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function spanExistsInOracle(span: string, oracleText: string): boolean {
  const normSpan = normalizeForSpanMatch(span);
  const normOracle = normalizeForSpanMatch(oracleText);
  if (normOracle.includes(normSpan)) return true;
  const words = normSpan.split(/\s+/).filter((w) => w.length > 3);
  if (words.length === 0) return normSpan.length <= 4 && normOracle.includes(normSpan);
  return words.filter((w) => normOracle.includes(w)).length / words.length >= 0.75;
}

function oracleSupportsAssertion(
  assertion: StrategicAssertionV3,
  oracleText: string,
  oracleSpan?: string,
): boolean {
  if (oracleSpan?.trim() && !spanExistsInOracle(oracleSpan, oracleText)) return false;
  const blob = oracleText.toLowerCase();
  if (assertion.predicate === "GRANTS_KEYWORD" && assertion.object) {
    return blob.includes(assertion.object.toLowerCase().replace(/_/g, " "));
  }
  if (assertion.action === "CAST_FROM_GRAVEYARD") {
    return blob.includes("cast") && blob.includes("graveyard") && blob.includes("permanent");
  }
  if (assertion.action === "PLAY_FROM_GRAVEYARD" && assertion.object === "LAND_CARD") {
    return blob.includes("play a land") && blob.includes("graveyard");
  }
  if (assertion.action === "ADDITIONAL_LAND_PLAY") {
    return /additional land|extra land|two lands|second land/i.test(blob);
  }
  if (
    assertion.predicate === "PERMITS_ACTION" &&
    assertion.action === "MOVE_CARDS" &&
    assertion.object?.includes("UNBLOCKED_ATTACKER") &&
    assertion.destinationZone === "HAND"
  ) {
    return blob.includes("return an unblocked attacker") && blob.includes("hand");
  }
  if (oracleSpan?.trim() && spanExistsInOracle(oracleSpan, oracleText)) {
    return factSupportsMechanicalAssertion(
      { mechanismId: "oracle-derived", mechanismType: "ORACLE", evidenceSpan: oracleSpan, actions: [] },
      assertion,
    ) || blob.includes(assertion.action?.toLowerCase().replace(/_/g, " ") ?? "");
  }
  return false;
}

function zoneFromAction(action: Record<string, unknown>): string | undefined {
  const zone = String(action.zone ?? action.sourceZone ?? action.from ?? "").toUpperCase();
  return zone || undefined;
}

function zoneMatchesFlexible(sourceZone: string | undefined, factZone: string, factOrigins: string[]): boolean {
  if (!sourceZone) return true;
  const src = sourceZone.toUpperCase();
  const zone = factZone.toUpperCase();
  if (src === zone) return true;
  if (src.includes("HAND") && src.includes("COMMAND")) {
    return factOrigins.some((o) => src.includes(String(o).toUpperCase())) || zone.includes("HAND") || zone.includes("COMMAND");
  }
  return src.includes(zone) || zone.includes(src.replace(/_OR_/g, ""));
}

function factOrigins(fact: IndependentMechanismFact): string[] {
  const origin = fact.origin;
  if (Array.isArray(origin)) return origin.map((o) => String(o).toUpperCase());
  if (origin) return [String(origin).toUpperCase()];
  return [];
}

function zoneMovePermitsAssertion(fact: IndependentMechanismFact, assertion: StrategicAssertionV3): boolean {
  if (assertion.predicate !== "PERMITS_ACTION" || assertion.action !== "MOVE_CARDS") return false;
  for (const action of actionList(fact)) {
    if (actionType(action) !== "ZONE_MOVE") continue;
    const obj = String(action.object ?? "").toUpperCase();
    const from = String(action.from ?? "").toUpperCase();
    const to = String(action.to ?? "").toUpperCase();
    if (assertion.object && obj && assertion.object !== obj && !obj.includes(assertion.object)) continue;
    if (assertion.sourceZone && !zoneMatchesFlexible(assertion.sourceZone, from, factOrigins(fact))) continue;
    if (assertion.destinationZone && to !== assertion.destinationZone) continue;
    return true;
  }
  return false;
}

function costPermitsAssertion(fact: IndependentMechanismFact, assertion: StrategicAssertionV3): boolean {
  if (assertion.predicate !== "PERMITS_ACTION" || assertion.action !== "MOVE_CARDS") return false;
  const costs = Array.isArray(fact.cost) ? fact.cost.map((c) => String(c).toUpperCase()) : [];
  if (costs.length === 0) return false;
  if (
    assertion.object?.includes("UNBLOCKED_ATTACKER") &&
    assertion.destinationZone === "HAND" &&
    costs.some((c) => c.includes("RETURN") && c.includes("UNBLOCKED") && c.includes("HAND"))
  ) {
    return true;
  }
  return false;
}

function factSupportsMechanicalAssertion(fact: IndependentMechanismFact, assertion: StrategicAssertionV3): boolean {
  if (assertion.predicate === "TRIGGERS_ON") {
    return triggerSupportsTriggersOnAssertion(fact, assertion) != null;
  }
  if (assertion.predicate === "PERMITS_ACTION" && assertion.action === "MOVE_CARDS") {
    if (zoneMovePermitsAssertion(fact, assertion) || costPermitsAssertion(fact, assertion)) return true;
  }
  if (assertion.predicate === "GRANTS_KEYWORD") {
    return assertion.object ? String(fact.keyword ?? "").toUpperCase() === assertion.object : false;
  }
  if (assertion.action === "ADDITIONAL_LAND_PLAY") {
    return flattenMechanismActions(fact).some((a) => actionType(a) === "ADDITIONAL_LAND_PLAY");
  }
  if (!assertion.action) return false;

  for (const action of flattenMechanismActions(fact)) {
    if (actionType(action) !== assertion.action) continue;
    if (assertion.action === "CREATE_TOKEN" && assertion.object) {
      const token = String(action.token ?? action.object ?? "");
      if (!tokenDescriptorMatchesAssertionObject(token, assertion.object)) continue;
      return true;
    }
    if (assertion.action === "MODIFY_TOKEN_CREATION") {
      const nested = action.addsAdditionalTokens;
      if (!nested || typeof nested !== "object") continue;
      if (assertion.object && !tokenDescriptorMatchesAssertionObject(String((nested as Record<string, unknown>).token ?? ""), assertion.object)) {
        continue;
      }
      return true;
    }
    if (assertion.action === "SACRIFICE") {
      const subtype = String(action.permanentSubtype ?? "").toUpperCase();
      if (assertion.object && assertion.object !== subtype && !assertion.object.includes(subtype)) continue;
      return true;
    }
    if (assertion.action === "MODIFY_STATS") {
      if (assertion.object && !assertion.object.includes("CREATURE") && !assertion.object.includes("TARGET")) continue;
      return true;
    }
    if (assertion.object) {
      const actionObject = String(action.object ?? action.target ?? "").toUpperCase();
      if (actionObject && actionObject !== assertion.object && !actionObject.includes(assertion.object)) continue;
    }
    if (assertion.sourceZone) {
      const zone = zoneFromAction(action);
      if (zone && zone !== assertion.sourceZone) continue;
    }
    if (assertion.destinationZone) {
      const dest = String(action.to ?? action.destinationZone ?? action.zone ?? "").toUpperCase();
      if (dest && dest !== assertion.destinationZone) continue;
    }
    if (assertion.timing && fact.trigger) {
      const trigger = String(fact.trigger).toUpperCase();
      const timing = assertion.timing.toUpperCase();
      if (trigger !== timing && !trigger.includes(timing)) continue;
    }
    if (assertion.quantityOrScaling && action.quantity) {
      const q = String(action.quantity).toUpperCase();
      if (!q.includes(assertion.quantityOrScaling.toUpperCase())) continue;
    }
    return true;
  }
  return false;
}

function mechanismFactsSupportMechanicalAssertion(facts: IndependentMechanismFact[], assertion: StrategicAssertionV3): boolean {
  return facts.some((fact) => factSupportsMechanicalAssertion(fact, assertion));
}

function isStatePredicate(predicate: AssertionPredicateV3): boolean {
  return predicate === "PRODUCES_STATE" || predicate === "REQUIRES_STATE" || predicate === "CONSUMES_STATE";
}

function rulesTextSupportsAssertion(assertion: StrategicAssertionV3, text: string): boolean {
  const blob = text.toLowerCase();
  if (assertion.action === "TUTOR" || assertion.action === "SEARCH_LIBRARY") {
    return blob.includes("search") && blob.includes("library");
  }
  if (assertion.action === "ADDITIONAL_LAND_PLAY") {
    return blob.includes("play a land") || blob.includes("land card");
  }
  if (assertion.predicate === "GRANTS_KEYWORD" && assertion.object) {
    return blob.includes(assertion.object.toLowerCase().replace(/_/g, " "));
  }
  if (assertion.action === "DRAW_CARD") {
    return blob.includes("draw") && blob.includes("card");
  }
  return false;
}

function ragSupportsStrategicInference(assertion: StrategicAssertionV3, text: string): boolean {
  if (CANONICAL_MECHANICAL_PREDICATES_V3.has(assertion.predicate)) return false;
  if (isStatePredicate(assertion.predicate)) {
    const state = assertion.resourceOrState ?? "";
    if (assertion.predicate === "PRODUCES_STATE" && MECHANICAL_STATE_HINT.test(state)) return false;
    return stateRelationshipEntailed(assertion, { ragText: text });
  }
  const blob = text.toLowerCase();
  if (assertion.action === "MOVE_CARDS" && assertion.destinationZone === "GRAVEYARD") {
    return blob.includes("mill") || blob.includes("graveyard");
  }
  return false;
}

function researchSupportsStrategicInference(assertion: StrategicAssertionV3, summary: string): boolean {
  return ragSupportsStrategicInference(assertion, summary);
}

function affordanceSupportsAssertion(assertion: StrategicAssertionV3, opp: SemanticOpportunity): boolean {
  const blob = [
    opp.causalStatement,
    opp.expectedMechanicalEffect,
    opp.semanticEdge,
    ...(opp.causalProof ?? []),
  ]
    .join(" ")
    .toLowerCase();
  if (assertion.action === "PLAY_FROM_GRAVEYARD" && assertion.object === "LAND_CARD") {
    return blob.includes("play_from_graveyard") || blob.includes("graveyard land");
  }
  return false;
}

function relationshipSupportsAssertion(
  assertion: StrategicAssertionV3,
  rel: SemanticRelationshipV3,
): boolean {
  const blob = [rel.causalStatement, rel.relationshipType].join(" ").toLowerCase();
  const state = assertion.resourceOrState?.toLowerCase().replace(/_/g, " ") ?? "";
  return state ? blob.includes("graveyard") || blob.includes(state) : blob.length > 0;
}

function canonicalEvidenceSupportsAssertion(
  ctx: AssertionResolverContextV3,
  assertion: StrategicAssertionV3,
  ref: EvidenceRef,
): boolean {
  if (ref.kind === "MECHANISM_FACT") {
    const facts = ref.factIds.map((id) => factMap(ctx).get(id)).filter(Boolean) as IndependentMechanismFact[];
    if (facts.length === 0) return false;
    if (isStatePredicate(assertion.predicate)) return stateEntailedByMechanismFacts(assertion, facts);
    return mechanismFactsSupportMechanicalAssertion(facts, assertion);
  }
  if (ref.kind === "ORACLE_CLAUSE") {
    const entry = ctx.oracleEntries.find((o) => o.sourceOracleId === ref.sourceOracleId);
    if (!entry) return false;
    if (isStatePredicate(assertion.predicate)) {
      return stateEntailedByOracle(assertion, entry.oracleText) || stateRelationshipEntailed(assertion, { oracleText: entry.oracleText });
    }
    return oracleSupportsAssertion(assertion, entry.oracleText, ref.oracleSpan);
  }
  if (ref.kind === "PRECOMPUTED_AFFORDANCE") {
    return ref.opportunityIds.some((oid) => {
      const opp = ctx.knownMechanicalAffordances.find((o) => o.opportunityId === oid);
      return opp ? affordanceSupportsAssertion(assertion, opp) : false;
    });
  }
  if (ref.kind === "SEMANTIC_RELATIONSHIP") {
    const rel = ctx.semanticRelationships.find((r) => r.relationshipId === ref.relationshipId);
    return rel ? relationshipSupportsAssertion(assertion, rel) : false;
  }
  return false;
}

function secondaryEvidenceSupportsAssertion(
  ctx: AssertionResolverContextV3,
  assertion: StrategicAssertionV3,
  ref: EvidenceRef,
): boolean {
  if (CANONICAL_MECHANICAL_PREDICATES_V3.has(assertion.predicate)) return false;
  if (ref.kind === "RULES_EVIDENCE") {
    const entry = ledgerRulesEntryByRuleId(ctx.ledger, ref.ruleId);
    return entry ? rulesTextSupportsAssertion(assertion, entry.exactText) : false;
  }
  if (ref.kind === "RAG_EVIDENCE") {
    return ref.evidenceIds.some((id) => {
      const entry = ledgerEntryById(ctx.ledger, id);
      return entry ? ragSupportsStrategicInference(assertion, entry.exactText) : false;
    });
  }
  if (ref.kind === "RESEARCH_EVIDENCE") {
    return ref.evidenceIds.some((id) => {
      const research = ctx.researchById.get(id);
      return research ? researchSupportsStrategicInference(assertion, research.summary) : false;
    });
  }
  return false;
}

export function evidenceRefEntailsAssertion(
  ctx: AssertionResolverContextV3,
  assertion: StrategicAssertionV3,
  ref: EvidenceRef,
): boolean {
  if (ref.kind === "MECHANISM_FACT" || ref.kind === "ORACLE_CLAUSE" || ref.kind === "PRECOMPUTED_AFFORDANCE" || ref.kind === "SEMANTIC_RELATIONSHIP") {
    return canonicalEvidenceSupportsAssertion(ctx, assertion, ref);
  }
  return secondaryEvidenceSupportsAssertion(ctx, assertion, ref);
}

export function validateStrategicAssertionV3(args: {
  ctx: AssertionResolverContextV3;
  assertion: StrategicAssertionV3;
  packageIds: Set<string>;
}): AssertionGroundingIssueV3[] {
  const assertion = normalizeStrategicAssertionV3(args.assertion);
  const issues: AssertionGroundingIssueV3[] = [];

  if (!args.packageIds.has(assertion.packageId)) {
    issues.push({
      code: "ASSERTION_UNKNOWN_PACKAGE",
      assertionId: assertion.assertionId,
      message: `Assertion '${assertion.assertionId}' references unknown package '${assertion.packageId}'`,
    });
  }
  if (assertion.predicate === "PERMITS_ACTION" && !assertion.action) {
    issues.push({
      code: "ASSERTION_INCOMPLETE",
      assertionId: assertion.assertionId,
      message: `Assertion '${assertion.assertionId}' with PERMITS_ACTION requires action`,
    });
  }
  if (assertion.predicate === "GRANTS_KEYWORD" && !assertion.object) {
    issues.push({
      code: "ASSERTION_INCOMPLETE",
      assertionId: assertion.assertionId,
      message: `Assertion '${assertion.assertionId}' with GRANTS_KEYWORD requires object`,
    });
  }
  if (
    (assertion.predicate === "PRODUCES_STATE" ||
      assertion.predicate === "REQUIRES_STATE" ||
      assertion.predicate === "CONSUMES_STATE") &&
    !assertion.resourceOrState
  ) {
    issues.push({
      code: "ASSERTION_INCOMPLETE",
      assertionId: assertion.assertionId,
      message: `Assertion '${assertion.assertionId}' requires resourceOrState`,
    });
  }
  if (issues.length > 0) return issues;

  if (assertion.evidenceRefs.length === 0) {
    issues.push({
      code: "ASSERTION_MISSING_EVIDENCE",
      assertionId: assertion.assertionId,
      message: `Assertion '${assertion.assertionId}' requires evidenceRefs`,
    });
    return issues;
  }

  let canonicalSupported = false;
  let secondarySupported = false;
  let derivationSupported = false;
  for (const ref of assertion.evidenceRefs) {
    if (ref.kind === "MECHANISM_FACT" || ref.kind === "ORACLE_CLAUSE") {
      if (canonicalEvidenceSupportsAssertion(args.ctx, assertion, ref)) canonicalSupported = true;
    } else if (secondaryEvidenceSupportsAssertion(args.ctx, assertion, ref)) {
      secondarySupported = true;
    } else if (canonicalEvidenceSupportsAssertion(args.ctx, assertion, ref)) {
      canonicalSupported = true;
    }
  }

  if (!canonicalSupported && !secondarySupported) {
    if (isStatePredicate(assertion.predicate) && tryDeriveGameStateProof(assertion, args.ctx)) {
      derivationSupported = true;
    } else if (assertion.predicate === "TRIGGERS_ON" && tryDeriveMechanicalAssertionProof(assertion, args.ctx)) {
      derivationSupported = true;
    } else if (assertion.predicate === "PERMITS_ACTION" && tryDerivePermitsActionFromMechanismProof(assertion, args.ctx)) {
      derivationSupported = true;
    }
  }

  const requiresCanonical =
    CANONICAL_MECHANICAL_PREDICATES_V3.has(assertion.predicate) ||
    (assertion.predicate === "PERMITS_ACTION" && Boolean(assertion.action));
  if (isStatePredicate(assertion.predicate) && !canonicalSupported && !secondarySupported && !derivationSupported) {
    issues.push({
      code: "ASSERTION_EVIDENCE_DOES_NOT_ENTAIL",
      assertionId: assertion.assertionId,
      message: `Evidence does not structurally establish ${assertion.predicate} '${assertion.resourceOrState}' for assertion '${assertion.assertionId}'`,
    });
  } else if (requiresCanonical && !canonicalSupported && !derivationSupported) {
    issues.push({
      code: "REJECTED_INVENTED_MECHANIC",
      assertionId: assertion.assertionId,
      message: `Typed assertion '${assertion.assertionId}' lacks canonical mechanism/oracle support for ${assertion.predicate}${assertion.action ? `/${assertion.action}` : ""}${assertion.object ? `/${assertion.object}` : ""}`,
    });
  } else if (!requiresCanonical && !isStatePredicate(assertion.predicate) && !canonicalSupported && !secondarySupported && !derivationSupported) {
    issues.push({
      code: "ASSERTION_EVIDENCE_DOES_NOT_ENTAIL",
      assertionId: assertion.assertionId,
      message: `Evidence does not structurally support assertion '${assertion.assertionId}'`,
    });
  }

  if (assertion.action === "ADDITIONAL_LAND_PLAY") {
    issues.push({
      code: "REJECTED_BROADENED_PERMISSION",
      assertionId: assertion.assertionId,
      message: `Assertion '${assertion.assertionId}' claims additional land-play permission`,
    });
  }

  return issues;
}

export function assertionRequiresCommander(assertion: StrategicAssertionV3): boolean {
  const normalized = normalizeStrategicAssertionV3(assertion);
  if (normalized.provider === "COMMANDER") return true;
  if (normalized.controllerScope === "COMMANDER") return true;
  return (
    normalized.predicate === "PERMITS_ACTION" &&
    (normalized.action === "CAST_FROM_GRAVEYARD" ||
      normalized.action === "PLAY_FROM_GRAVEYARD" ||
      normalized.sourceZone === "GRAVEYARD")
  );
}

export function validatedProducerStates(assertions: StrategicAssertionV3[], validIds: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const assertion of assertions) {
    if (!validIds.has(assertion.assertionId)) continue;
    if (!PRODUCER_PREDICATES_V3.has(assertion.predicate)) continue;
    if (assertion.resourceOrState) out.set(assertion.assertionId, assertion.resourceOrState);
  }
  return out;
}

export function validatedConsumerStates(assertions: StrategicAssertionV3[], validIds: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const assertion of assertions) {
    if (!validIds.has(assertion.assertionId)) continue;
    if (!CONSUMER_PREDICATES_V3.has(assertion.predicate)) continue;
    if (assertion.resourceOrState) out.set(assertion.assertionId, assertion.resourceOrState);
  }
  return out;
}

export function validateCausalEdgeV3(args: {
  edge: CausalEdgeV3;
  assertionsById: Map<string, StrategicAssertionV3>;
  validAssertionIds: Set<string>;
}): AssertionGroundingIssueV3[] {
  const issues: AssertionGroundingIssueV3[] = [];
  const producer = args.assertionsById.get(args.edge.producerAssertionId);
  const consumer = args.assertionsById.get(args.edge.consumerAssertionId);
  if (!producer || !consumer) {
    issues.push({
      code: "HARMONY_UNDERDETERMINED",
      edgeId: args.edge.edgeId,
      message: "Causal edge references unknown assertion IDs",
    });
    return issues;
  }
  if (!args.validAssertionIds.has(producer.assertionId) || !args.validAssertionIds.has(consumer.assertionId)) {
    issues.push({
      code: "HARMONY_UNDERDETERMINED",
      edgeId: args.edge.edgeId,
      message: "Causal edge connects unvalidated assertions",
    });
    return issues;
  }
  const producerState = producer.resourceOrState ?? args.edge.resourceOrState;
  const consumerState = consumer.resourceOrState ?? args.edge.resourceOrState;
  if (
    !producerState ||
    !consumerState ||
    !deriveProducerConsumerBridgeCompatible({
      producerState,
      consumerState,
      edgeState: args.edge.resourceOrState,
    })
  ) {
    issues.push({
      code: "HARMONY_UNDERDETERMINED",
      edgeId: args.edge.edgeId,
      message: "Causal edge resource/state bridge does not match validated producer/consumer assertions",
    });
  }
  return issues;
}

export function buildAssertionResolverContextV3(ctx: ProfessorPlanningContextV3): AssertionResolverContextV3 {
  return {
    mechanismFacts: ctx.commanderMechanismFacts,
    knownMechanicalAffordances: ctx.knownMechanicalAffordances,
    semanticRelationships: ctx.semanticRelationships,
    oracleEntries: ctx.canonicalOracle,
    ledger: buildProfessorEvidenceLedgerV3(ctx),
    researchById: new Map(ctx.initialResearchEvidence.map((r) => [r.evidenceId, { summary: r.summary }])),
  };
}
