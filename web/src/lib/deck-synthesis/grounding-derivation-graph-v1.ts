/**
 * Generic grounding derivation graph — canonical facts → derived states → strategic conclusions.
 * No commander-specific branches.
 */
import type { IndependentMechanismFact } from "./independent-truth-types-v1";
import type { EvidenceRef } from "./professor-planning-evidence-v3";
import type { StrategicAssertionV3 } from "./strategic-assertion-vocabulary-v3";
import type { AssertionResolverContextV3 } from "./typed-assertion-grounding-v3";
import { ledgerEntryById } from "./professor-v3-evidence-ledger-v1";

export const GROUNDING_DERIVATION_GRAPH_V1_VERSION = "grounding-derivation-graph-v1";

export type AssertionGroundingLevelV1 =
  | "CANONICAL_MECHANIC"
  | "DERIVED_GAME_STATE"
  | "STRATEGIC_CONCLUSION";

export type GroundingDerivationProofV1 = {
  level: AssertionGroundingLevelV1;
  ruleIds: string[];
  sourceEvidenceIds: string[];
  intermediateStates: string[];
  derivedState: string;
};

function actionList(fact: IndependentMechanismFact): Array<Record<string, unknown>> {
  return Array.isArray(fact.actions) ? (fact.actions as Array<Record<string, unknown>>) : [];
}

function actionType(action: Record<string, unknown>): string {
  return String(action.type ?? "").toUpperCase();
}

const TOKEN_COLOR_WORDS = new Set(["WHITE", "BLUE", "BLACK", "RED", "GREEN", "COLORLESS"]);

export function normalizeTokenObjectLabel(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function normalizedResourcesFromTokenDescriptor(token: string): string[] {
  const states: string[] = [];
  const lower = token.toLowerCase().trim();
  if (!lower) return states;
  if (lower.includes("treasure")) states.push("TREASURE_TOKENS");
  if (lower.includes("creature")) states.push("CREATURE_TOKENS");
  const parts = lower.replace(/\d+\/\d+/g, " ").trim().split(/\s+/).filter(Boolean);
  const creatureIdx = parts.indexOf("creature");
  if (creatureIdx > 0) {
    for (let i = creatureIdx - 1; i >= 0; i--) {
      const word = parts[i]!;
      if (TOKEN_COLOR_WORDS.has(word.toUpperCase())) continue;
      const subtype = word.toUpperCase();
      states.push(`${subtype}S`);
      states.push(`${subtype}_TOKENS`);
      states.push(`${subtype}_PERMANENTS`);
      break;
    }
  }
  return states;
}

export function normalizedResourcesFromPermanentSubtype(subtype: string): string[] {
  const normalized = subtype.trim().toUpperCase();
  if (!normalized) return [];
  return [`${normalized}S`, `${normalized}_TOKENS`, `${normalized}_PERMANENTS`];
}

export function tokenDescriptorMatchesAssertionObject(token: string, assertionObject: string): boolean {
  if (!token || !assertionObject) return false;
  const normalizedToken = normalizeTokenObjectLabel(token);
  const normalizedObject = normalizeTokenObjectLabel(assertionObject);
  if (normalizedToken === normalizedObject) return true;
  if (normalizedObject.includes(normalizedToken) || normalizedToken.includes(normalizedObject)) return true;
  const descriptorWords = token
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 1 && !TOKEN_COLOR_WORDS.has(word.toUpperCase()) && !/^\d+\/\d+$/.test(word));
  const objectBlob = assertionObject.toLowerCase().replace(/_/g, " ");
  return descriptorWords.length > 0 && descriptorWords.every((word) => objectBlob.includes(word));
}

export function flattenMechanismActions(fact: IndependentMechanismFact): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const action of actionList(fact)) {
    out.push(action);
    if (actionType(action) === "MODIFY_TOKEN_CREATION") {
      const nested = action.addsAdditionalTokens;
      if (nested && typeof nested === "object") out.push(nested as Record<string, unknown>);
    }
  }
  return out;
}

function addTokenResourceStates(states: Set<string>, token: string): void {
  for (const state of normalizedResourcesFromTokenDescriptor(token)) states.add(state);
}

function producedStatesFromAction(_fact: IndependentMechanismFact, action: Record<string, unknown>): Set<string> {
  const states = new Set<string>();
  const type = actionType(action);
  if (type === "ADD_MANA") states.add("MANA");
  if (type === "DEAL_DAMAGE") states.add("DAMAGE");
  if (type === "DRAW_CARD") states.add("CARD_ADVANTAGE");
  if (type === "LOSE_LIFE") states.add("LIFE_LOSS");
  if (type === "REVEAL") states.add("REVEALED_CARD");
  if (type === "COPY_SPELL") {
    states.add("SPELL_COPIES");
    states.add("MULTIPLE_SPELL_RESOLUTIONS");
  }
  if (type === "ZONE_MOVE") {
    const dest = String(action.to ?? action.destinationZone ?? "").toUpperCase();
    if (dest === "HAND") states.add("CARD_IN_HAND");
    if (dest === "GRAVEYARD") states.add("GRAVEYARD_PERMANENTS");
    if (dest === "EXILE") states.add("EXILE_PLAYABLE_CARDS");
  }
  if (type === "CREATE_TOKEN") {
    addTokenResourceStates(states, String(action.token ?? action.object ?? ""));
  }
  if (type === "MODIFY_TOKEN_CREATION") {
    const nested = action.addsAdditionalTokens;
    if (nested && typeof nested === "object") {
      for (const state of producedStatesFromAction(_fact, nested as Record<string, unknown>)) states.add(state);
    }
  }
  if (type === "MODIFY_STATS") {
    states.add("CREATURE_STAT_MODIFICATION");
    const power = String(action.powerModifier ?? "").toUpperCase();
    const toughness = String(action.toughnessModifier ?? "").toUpperCase();
    if (power.includes("X") || toughness.includes("X")) states.add("PLUS_X_MINUS_X_UNTIL_END_OF_TURN");
  }
  if (type === "PUT_COUNTER") states.add("COUNTER_SCALING");
  if (type === "MILL") states.add("GRAVEYARD_PERMANENTS");
  return states;
}

export function requiredStatesFromMechanismFact(fact: IndependentMechanismFact): Set<string> {
  const states = new Set<string>();
  for (const action of flattenMechanismActions(fact)) {
    const type = actionType(action);
    if (type === "CAST_FROM_GRAVEYARD" || type === "PLAY_FROM_GRAVEYARD") states.add("GRAVEYARD_PERMANENTS");
    if (type === "SACRIFICE") {
      states.add("SACRIFICE_FODDER");
      for (const state of normalizedResourcesFromPermanentSubtype(String(action.permanentSubtype ?? ""))) states.add(state);
    }
  }
  if (String(fact.trigger ?? "").includes("SACRIFICE")) states.add("SACRIFICE_FODDER");
  return states;
}

export function canonicalStatesFromMechanismFact(fact: IndependentMechanismFact): Set<string> {
  const states = new Set<string>();
  for (const action of flattenMechanismActions(fact)) {
    for (const state of producedStatesFromAction(fact, action)) states.add(state);
  }
  const actions = actionList(fact);
  const hasReveal = actions.some((a) => actionType(a) === "REVEAL");
  const hasMoveToHand = actions.some(
    (a) => actionType(a) === "ZONE_MOVE" && String(a.to ?? "").toUpperCase() === "HAND",
  );
  if (hasReveal && hasMoveToHand) {
    states.add("REVEALED_CARD_IN_HAND");
    states.add("CARD_REVEALED_AND_ADDED_TO_HAND");
  }
  return states;
}

const GENERIC_TRIGGER_VOCABULARY = new Set([
  "YOU",
  "YOUR",
  "CONTROL",
  "CONTROLLER",
  "DEALS",
  "DEAL",
  "COMBAT",
  "DAMAGE",
  "TO",
  "PLAYER",
  "PLAYERS",
  "OPPONENT",
  "OPPONENTS",
  "A",
  "AN",
  "THE",
  "CAST",
  "CASTS",
  "INSTANT",
  "SORCERY",
  "SPELL",
  "SPELLS",
  "TARGET",
  "TARGETS",
  "ONLY",
  "COMMANDER",
  "SACRIFICE",
  "SACRIFICES",
  "PLAY",
  "LAND",
  "WHENEVER",
  "WHEN",
  "EACH",
  "OTHER",
  "CREATURE",
  "CREATURES",
  "FROM",
  "PUT",
  "ONTO",
  "INTO",
  "OR",
  "AND",
  "THAT",
  "FOR",
  "WITH",
  "COULD",
  "BE",
  "ONE",
  "OF",
  "THOSE",
  "DIFFERENT",
  "PERMANENT",
  "PERMANENTS",
]);

function tokenizeStructuralId(value: string): string[] {
  return value.toUpperCase().split("_").filter(Boolean);
}

function extractQualifyingPermanentTokens(trigger: string): string[] {
  return tokenizeStructuralId(trigger).filter(
    (token) => !GENERIC_TRIGGER_VOCABULARY.has(token) && token.length > 2,
  );
}

function triggerEventStructurallyMatches(fact: IndependentMechanismFact, eventToken: string): boolean {
  const trigger = String(fact.trigger ?? "").toUpperCase();
  const event = eventToken.toUpperCase();
  if (!trigger || !event) return false;
  if (trigger === event) return true;

  if (event.includes("COMBAT") && event.includes("DAMAGE")) {
    return (
      trigger.includes("COMBAT") &&
      trigger.includes("DAMAGE") &&
      (trigger.includes("PLAYER") || trigger.includes("OPPONENT"))
    );
  }

  if (
    (event.includes("INSTANT") || event.includes("SORCERY") || event.includes("SPELL")) &&
    (event.includes("CAST") || event.includes("TARGET"))
  ) {
    return (
      trigger.includes("CAST") &&
      (trigger.includes("INSTANT") || trigger.includes("SORCERY") || trigger.includes("SPELL")) &&
      (trigger.includes("TARGET") || trigger.includes("SPELL"))
    );
  }

  if (event.includes("SACRIFICE") && trigger.includes("SACRIFICE")) return true;
  if (event.includes("PLAY") && event.includes("LAND") && trigger.includes("LAND")) return true;

  const qualifyingTokens = extractQualifyingPermanentTokens(trigger);
  if (qualifyingTokens.length > 0 && qualifyingTokens.every((token) => event.includes(token))) {
    if (trigger.includes("YOU_CONTROL") && !(event.includes("YOU_CONTROL") || event.includes("_YOU_"))) {
      return false;
    }
    return true;
  }

  const significant = tokenizeStructuralId(trigger).filter(
    (token) => !GENERIC_TRIGGER_VOCABULARY.has(token) && token.length > 2,
  );
  if (significant.length > 0 && significant.every((token) => event.includes(token))) return true;

  return trigger.includes(event) || event.includes(trigger);
}

export function triggerSupportsTriggersOnAssertion(
  fact: IndependentMechanismFact,
  assertion: StrategicAssertionV3,
): GroundingDerivationProofV1 | null {
  if (assertion.predicate !== "TRIGGERS_ON") return null;
  const eventToken = String(assertion.action ?? assertion.object ?? "").toUpperCase();
  if (!eventToken) return null;
  const trigger = String(fact.trigger ?? "").toUpperCase();
  if (!trigger) return null;

  if (!triggerEventStructurallyMatches(fact, eventToken)) return null;
  return {
    level: "CANONICAL_MECHANIC",
    ruleIds: ["trigger-event-normalization-v1"],
    sourceEvidenceIds: [fact.mechanismId],
    intermediateStates: [trigger],
    derivedState: `${assertion.predicate}/${eventToken}`,
  };
}

const STATE_SEMANTIC_GROUPS: string[][] = [
  ["REVEALED_CARD_IN_HAND", "CARD_REVEALED_AND_ADDED_TO_HAND", "CARD_IN_HAND"],
  ["LIFE_LOSS", "OPPONENT_LIFE_LOSS", "SCALED_TABLE_LIFE_LOSS", "CARD_IN_HAND_AND_EACH_OPPONENT_LIFE_LOSS"],
  ["MULTIPLE_QUALIFYING_TRIGGER_EVENTS", "MULTIPLE_QUALIFYING_COMBAT_DAMAGE_EVENTS"],
  [
    "MULTIPLE_SPELL_RESOLUTIONS",
    "MULTIPLE_SPELL_COPIES",
    "MULTIPLE_QUALIFYING_SPELL_COPY_EVENTS",
  ],
  ["ENGINEERED_TOP_CARD", "TOP_OF_LIBRARY_MANIPULATION", "TOP_CARD_SELECTION_AND_NEEDED_CARD_ACCESS"],
  ["IMPROVED_ACCESS_TO_NEEDED_CARDS", "TOP_DECK_SELECTION_AND_IMPROVED_ACCESS", "CARD_SELECTION"],
  ["TOP_OF_LIBRARY_CARD", "ENGINEERED_TOP_CARD"],
];

export function statesSemanticallyCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  const upperA = a.toUpperCase();
  const upperB = b.toUpperCase();
  for (const group of STATE_SEMANTIC_GROUPS) {
    if (group.includes(upperA) && group.includes(upperB)) return true;
  }
  if (upperA.includes("LIFE_LOSS") && upperB.includes("LIFE_LOSS")) return true;
  if (upperA.includes("REVEAL") && upperB.includes("REVEAL") && upperA.includes("HAND") && upperB.includes("HAND")) {
    return true;
  }
  if (upperA.includes("TOP") && upperB.includes("TOP") && (upperA.includes("LIBRARY") || upperB.includes("LIBRARY"))) {
    return true;
  }
  if (
    upperA.includes("HIGH_MANA") &&
    upperA.includes("TOP") &&
    (upperB.includes("ENGINEERED_TOP") || upperB.includes("TOP_OF_LIBRARY"))
  ) {
    return true;
  }
  if (
    upperB.includes("HIGH_MANA") &&
    upperB.includes("TOP") &&
    (upperA.includes("ENGINEERED_TOP") || upperA.includes("TOP_OF_LIBRARY"))
  ) {
    return true;
  }
  return false;
}

export function harmonyBridgeStatesCompatible(producerStates: Iterable<string>, consumerStates: Iterable<string>): boolean {
  for (const producer of producerStates) {
    for (const consumer of consumerStates) {
      if (statesSemanticallyCompatible(producer, consumer)) return true;
    }
  }
  return false;
}

function ragTextsForRefs(ctx: AssertionResolverContextV3, refs: EvidenceRef[]): string[] {
  const texts: string[] = [];
  for (const ref of refs) {
    if (ref.kind !== "RAG_EVIDENCE") continue;
    for (const id of ref.evidenceIds) {
      const entry = ledgerEntryById(ctx.ledger, id);
      if (entry?.exactText) texts.push(entry.exactText);
    }
  }
  return texts;
}

function mechanismFactsFromRefs(ctx: AssertionResolverContextV3, refs: EvidenceRef[]): IndependentMechanismFact[] {
  const map = new Map(ctx.mechanismFacts.map((f) => [f.mechanismId, f]));
  const out: IndependentMechanismFact[] = [];
  for (const ref of refs) {
    if (ref.kind !== "MECHANISM_FACT") continue;
    for (const id of ref.factIds) {
      const fact = map.get(id);
      if (fact) out.push(fact);
    }
  }
  return out;
}

function canonicalStatesFromEvidenceRefs(
  ctx: AssertionResolverContextV3,
  refs: EvidenceRef[],
): { states: Set<string>; factIds: string[] } {
  const states = new Set<string>();
  const factIds: string[] = [];
  for (const fact of mechanismFactsFromRefs(ctx, refs)) {
    factIds.push(fact.mechanismId);
    for (const state of canonicalStatesFromMechanismFact(fact)) states.add(state);
  }
  return { states, factIds };
}

function stateLabelMatchesCanonicalDerived(requested: string, canonicalStates: Set<string>): GroundingDerivationProofV1 | null {
  for (const canonical of canonicalStates) {
    if (canonical === requested || statesSemanticallyCompatible(requested, canonical)) {
      return {
        level: "DERIVED_GAME_STATE",
        ruleIds: ["action-to-state-derivation-v1"],
        sourceEvidenceIds: [],
        intermediateStates: [canonical],
        derivedState: requested,
      };
    }
  }
  return null;
}

function tryMultiplicityStrategicProof(
  assertion: StrategicAssertionV3,
  ctx: AssertionResolverContextV3,
): GroundingDerivationProofV1 | null {
  const state = assertion.resourceOrState;
  if (!state || !state.includes("MULTIPLE")) return null;
  const { states, factIds } = canonicalStatesFromEvidenceRefs(ctx, assertion.evidenceRefs);
  const hasQualifyingTrigger = [...states].some(
    (s) => s.includes("DAMAGE") || s.includes("TRIGGER") || s.includes("COMBAT"),
  );
  const triggerProof = mechanismFactsFromRefs(ctx, assertion.evidenceRefs).some(
    (fact) => triggerSupportsTriggersOnAssertion(fact, { ...assertion, predicate: "TRIGGERS_ON", action: "COMBAT_DAMAGE_EVENT" }) != null ||
      String(fact.trigger ?? "").includes("COMBAT"),
  );
  if (!hasQualifyingTrigger && !triggerProof) return null;

  const mechanismFacts = mechanismFactsFromRefs(ctx, assertion.evidenceRefs);
  const qualifyingTokens = mechanismFacts.flatMap((fact) =>
    extractQualifyingPermanentTokens(String(fact.trigger ?? "")),
  );
  const ragBlob = ragTextsForRefs(ctx, assertion.evidenceRefs).join(" ").toLowerCase();
  const multiplicityHint =
    ragBlob.includes("multiple") ||
    ragBlob.includes("go wide") ||
    ragBlob.includes("several") ||
    qualifyingTokens.some(
      (token) =>
        ragBlob.includes(`each ${token.toLowerCase()}`) ||
        ragBlob.includes(`each ${token.toLowerCase()}s`),
    ) ||
    state.includes("MULTIPLE");

  if (!multiplicityHint) return null;
  return {
    level: "STRATEGIC_CONCLUSION",
    ruleIds: ["compositional-multiplicity-of-qualifying-events-v1"],
    sourceEvidenceIds: factIds,
    intermediateStates: [...states],
    derivedState: state,
  };
}

const STRATEGIC_STATE_PATTERNS: Array<{ pattern: RegExp; ruleId: string }> = [
  {
    pattern: /EARLY|WINDOW|TEMPO|SETUP|PROTECTION|INDEPENDENT|IMPROVED_ACCESS|COMMANDER_INDEPENDENT|NEEDED_CARDS|COMPACT_LIBRARY/i,
    ruleId: "strategic-conclusion-from-qualified-evidence-v1",
  },
];

const GENERIC_CANONICAL_HINT_WORDS = [
  "combat",
  "damage",
  "reveal",
  "hand",
  "library",
  "top",
  "cast",
  "target",
  "spell",
  "copy",
  "trigger",
  "life",
  "zone",
  "move",
] as const;

function canonicalHintPatternFromMechanismFacts(facts: IndependentMechanismFact[]): RegExp {
  const tokens = new Set<string>(GENERIC_CANONICAL_HINT_WORDS);
  for (const fact of facts) {
    for (const token of tokenizeStructuralId(String(fact.trigger ?? ""))) {
      if (!GENERIC_TRIGGER_VOCABULARY.has(token) && token.length > 2) tokens.add(token.toLowerCase());
    }
    for (const action of actionList(fact)) {
      for (const token of tokenizeStructuralId(actionType(action))) {
        if (!GENERIC_TRIGGER_VOCABULARY.has(token) && token.length > 2) tokens.add(token.toLowerCase());
      }
    }
  }
  return new RegExp([...tokens].join("|"), "i");
}

const MECHANICAL_STATE_HINT = /TOP|LIBRARY|HAND|BATTLEFIELD|GRAVEYARD|EXILE|DAMAGE|LIFE|TAP|TOKEN|COUNTER|MANA/i;

export { MECHANICAL_STATE_HINT };

function consumedStatesFromMechanismFact(fact: IndependentMechanismFact): Set<string> {
  const states = new Set<string>();
  for (const action of flattenMechanismActions(fact)) {
    const type = actionType(action);
    if (type === "CAST_FROM_GRAVEYARD" || type === "PLAY_FROM_GRAVEYARD") states.add("GRAVEYARD_PERMANENTS");
    if (type === "SACRIFICE") {
      states.add("SACRIFICE_FODDER");
      for (const state of normalizedResourcesFromPermanentSubtype(String(action.permanentSubtype ?? ""))) states.add(state);
    }
    if (type === "REVEAL") {
      states.add("TOP_OF_LIBRARY_CARD");
      states.add("ENGINEERED_TOP_CARD");
    }
  }
  return states;
}

function tryStrategicConclusionProof(
  assertion: StrategicAssertionV3,
  ctx: AssertionResolverContextV3,
): GroundingDerivationProofV1 | null {
  const state = assertion.resourceOrState;
  if (!state) return null;
  if (state.includes("MULTIPLE")) return tryMultiplicityStrategicProof(assertion, ctx);

  const matchedPattern = STRATEGIC_STATE_PATTERNS.find((p) => p.pattern.test(state));
  if (!matchedPattern) return null;

  const ragTexts = ragTextsForRefs(ctx, assertion.evidenceRefs);
  if (ragTexts.length === 0) return null;

  const ragBlob = ragTexts.join(" ").toLowerCase();
  const stateWords = state.toLowerCase().replace(/_/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const ragSupportsState = stateWords.some((w) => ragBlob.includes(w));
  if (!ragSupportsState) return null;

  const mechanismFacts = mechanismFactsFromRefs(ctx, assertion.evidenceRefs);
  const { states, factIds } = canonicalStatesFromEvidenceRefs(ctx, assertion.evidenceRefs);
  const oracleBlob = ctx.oracleEntries.map((o) => o.oracleText).join(" ").toLowerCase();
  const canonicalHintPattern = canonicalHintPatternFromMechanismFacts(mechanismFacts);
  const hasCanonicalAnchor =
    mechanismFacts.length > 0 &&
    (states.size > 0 || canonicalHintPattern.test(ragBlob) || canonicalHintPattern.test(oracleBlob));

  if (
    assertion.predicate === "PRODUCES_STATE" &&
    MECHANICAL_STATE_HINT.test(state) &&
    mechanismFacts.length === 0
  ) {
    return null;
  }

  if (!hasCanonicalAnchor && assertion.predicate !== "CONSUMES_STATE") return null;

  if (assertion.predicate === "CONSUMES_STATE") {
    const consumed = new Set<string>();
    for (const fact of mechanismFacts) {
      for (const s of consumedStatesFromMechanismFact(fact)) consumed.add(s);
    }
    const consumeMatch = stateLabelMatchesCanonicalDerived(state, consumed);
    if (consumeMatch) {
      return {
        ...consumeMatch,
        level: "STRATEGIC_CONCLUSION",
        ruleIds: ["consume-derived-top-card-v1"],
        sourceEvidenceIds: factIds,
      };
    }
    if (mechanismFacts.length === 0) return null;
  }

  return {
    level: "STRATEGIC_CONCLUSION",
    ruleIds: [matchedPattern.ruleId],
    sourceEvidenceIds: factIds,
    intermediateStates: [...states],
    derivedState: state,
  };
}

export function tryDeriveGameStateProof(
  assertion: StrategicAssertionV3,
  ctx: AssertionResolverContextV3,
): GroundingDerivationProofV1 | null {
  const state = assertion.resourceOrState;
  if (!state) return null;
  if (
    assertion.predicate !== "PRODUCES_STATE" &&
    assertion.predicate !== "CONSUMES_STATE" &&
    assertion.predicate !== "REQUIRES_STATE"
  ) {
    return null;
  }

  const { states, factIds } = canonicalStatesFromEvidenceRefs(ctx, assertion.evidenceRefs);
  const direct = stateLabelMatchesCanonicalDerived(state, states);
  if (direct) {
    return { ...direct, sourceEvidenceIds: factIds.length ? factIds : direct.sourceEvidenceIds };
  }

  if (assertion.predicate === "CONSUMES_STATE" || assertion.predicate === "REQUIRES_STATE") {
    const targetStates = new Set<string>();
    for (const fact of mechanismFactsFromRefs(ctx, assertion.evidenceRefs)) {
      const source =
        assertion.predicate === "REQUIRES_STATE"
          ? requiredStatesFromMechanismFact(fact)
          : consumedStatesFromMechanismFact(fact);
      for (const s of source) targetStates.add(s);
    }
    const consumeMatch = stateLabelMatchesCanonicalDerived(state, targetStates);
    if (consumeMatch) {
      return {
        ...consumeMatch,
        sourceEvidenceIds: factIds.length ? factIds : consumeMatch.sourceEvidenceIds,
      };
    }
  }

  return tryStrategicConclusionProof(assertion, ctx);
}

export function tryDerivePermitsActionFromMechanismProof(
  assertion: StrategicAssertionV3,
  ctx: AssertionResolverContextV3,
): GroundingDerivationProofV1 | null {
  if (assertion.predicate !== "PERMITS_ACTION" || !assertion.action) return null;

  if (assertion.action === "CREATE_TOKEN" || assertion.action === "MODIFY_TOKEN_CREATION") {
    for (const ref of assertion.evidenceRefs) {
      if (ref.kind !== "MECHANISM_FACT") continue;
      for (const id of ref.factIds) {
        const fact = ctx.mechanismFacts.find((entry) => entry.mechanismId === id);
        if (!fact) continue;
        for (const action of flattenMechanismActions(fact)) {
          const type = actionType(action);
          if (type !== "CREATE_TOKEN" && type !== "MODIFY_TOKEN_CREATION") continue;
          const tokenAction =
            type === "MODIFY_TOKEN_CREATION" ? (action.addsAdditionalTokens as Record<string, unknown> | undefined) : action;
          if (!tokenAction || actionType(tokenAction) !== "CREATE_TOKEN") continue;
          if (assertion.object && !tokenDescriptorMatchesAssertionObject(String(tokenAction.token ?? tokenAction.object ?? ""), assertion.object)) {
            continue;
          }
          return {
            level: "CANONICAL_MECHANIC",
            ruleIds: ["nested-create-token-from-modify-token-creation-v1"],
            sourceEvidenceIds: [fact.mechanismId],
            intermediateStates: [...normalizedResourcesFromTokenDescriptor(String(tokenAction.token ?? tokenAction.object ?? ""))],
            derivedState: `${assertion.predicate}/${assertion.action}/${assertion.object ?? "TOKEN"}`,
          };
        }
      }
    }
  }

  if (assertion.action === "SACRIFICE" || assertion.action === "MODIFY_STATS") {
    for (const ref of assertion.evidenceRefs) {
      if (ref.kind !== "MECHANISM_FACT") continue;
      for (const id of ref.factIds) {
        const fact = ctx.mechanismFacts.find((entry) => entry.mechanismId === id);
        if (!fact) continue;
        const actions = flattenMechanismActions(fact);
        const hasSacrifice = actions.some((action) => actionType(action) === "SACRIFICE");
        const hasModifyStats = actions.some((action) => actionType(action) === "MODIFY_STATS");
        if (
          (assertion.action === "SACRIFICE" && hasSacrifice) ||
          (assertion.action === "MODIFY_STATS" && hasModifyStats) ||
          (hasSacrifice && hasModifyStats)
        ) {
          return {
            level: "CANONICAL_MECHANIC",
            ruleIds: ["canonical-sacrifice-modify-stats-v1"],
            sourceEvidenceIds: [fact.mechanismId],
            intermediateStates: [...requiredStatesFromMechanismFact(fact), ...canonicalStatesFromMechanismFact(fact)],
            derivedState: `${assertion.predicate}/${assertion.action}/${assertion.object ?? "STAT_MODIFICATION"}`,
          };
        }
      }
    }
  }

  if (assertion.action !== "MOVE_CARDS") return null;

  if (
    assertion.object === "REVEALED_CARD" &&
    assertion.sourceZone === "LIBRARY" &&
    assertion.destinationZone === "HAND"
  ) {
    const derived = tryDeriveGameStateProof(
      {
        ...assertion,
        predicate: "PRODUCES_STATE",
        resourceOrState: "REVEALED_CARD_IN_HAND",
      },
      ctx,
    );
    if (!derived) return null;
    return {
      level: "DERIVED_GAME_STATE",
      ruleIds: ["permits-action-to-derived-state-v1", ...derived.ruleIds],
      sourceEvidenceIds: derived.sourceEvidenceIds,
      intermediateStates: derived.intermediateStates,
      derivedState: "REVEALED_CARD_IN_HAND",
    };
  }

  return null;
}

export function tryDeriveMechanicalAssertionProof(
  assertion: StrategicAssertionV3,
  ctx: AssertionResolverContextV3,
): GroundingDerivationProofV1 | null {
  if (assertion.predicate !== "TRIGGERS_ON") return null;
  if (!assertion.action && !assertion.object) return null;
  for (const ref of assertion.evidenceRefs) {
    if (ref.kind !== "MECHANISM_FACT") continue;
    for (const id of ref.factIds) {
      const fact = ctx.mechanismFacts.find((f) => f.mechanismId === id);
      if (!fact) continue;
      const proof = triggerSupportsTriggersOnAssertion(fact, assertion);
      if (proof) return proof;
    }
  }
  return null;
}

export function deriveProducerConsumerBridgeCompatible(args: {
  producerState: string;
  consumerState: string;
  edgeState: string;
}): boolean {
  const { producerState, consumerState, edgeState } = args;
  if (producerState === consumerState && producerState === edgeState) return true;
  if (statesSemanticallyCompatible(producerState, consumerState) && statesSemanticallyCompatible(edgeState, producerState)) {
    return true;
  }
  if (statesSemanticallyCompatible(producerState, edgeState) && statesSemanticallyCompatible(consumerState, edgeState)) {
    return true;
  }
  return false;
}
