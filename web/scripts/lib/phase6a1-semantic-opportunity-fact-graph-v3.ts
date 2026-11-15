/**
 * Typed semantic role extraction from frozen mechanism facts (v3).
 */
import type { IndependentMechanismFact } from "../../src/lib/deck-synthesis/independent-truth-types-v1";

export const SEMANTIC_OPPORTUNITY_FACT_GRAPH_V3_VERSION = "phase6a1-semantic-opportunity-fact-graph-v3";

export type SemanticRoleKind =
  | "TRIGGER"
  | "CONDITION"
  | "COST"
  | "ACTION"
  | "OUTPUT"
  | "TARGET"
  | "REPLACEMENT_EFFECT"
  | "PLAY_CAST_PERMISSION"
  | "DELAYED_CONSEQUENCE"
  | "QUANTITY_SCALER"
  | "TIMING_RESTRICTION"
  | "ACTOR"
  | "OBJECT"
  | "FROM_ZONE"
  | "TO_ZONE";

export type TypedAction = Record<string, unknown> & { type?: string };

export type FactSemanticGraph = {
  mechanismId: string;
  mechanismType: string;
  evidenceSpan: string;
  commanderMember?: string;
  roles: Partial<Record<SemanticRoleKind, string | string[]>>;
  actions: TypedAction[];
  costs: string[];
  trigger?: string | string[];
  target?: string;
  condition?: string;
  subject?: string;
  event?: string;
  variable?: string;
  activationRestriction?: string;
  face?: string;
};

function asActions(fact: IndependentMechanismFact): TypedAction[] {
  const raw = fact.actions;
  return Array.isArray(raw) ? (raw as TypedAction[]) : [];
}

function asCosts(fact: IndependentMechanismFact): string[] {
  const cost = Array.isArray(fact.cost) ? (fact.cost as string[]) : [];
  const granted = Array.isArray((fact as { grantedCost?: string[] }).grantedCost)
    ? ((fact as { grantedCost?: string[] }).grantedCost as string[])
    : [];
  return [...cost, ...granted];
}

function collectZones(actions: TypedAction[]): { from?: string[]; to?: string[] } {
  const from: string[] = [];
  const to: string[] = [];
  for (const a of actions) {
    if (typeof a.from === "string") from.push(a.from);
    if (typeof a.to === "string") to.push(a.to);
    if (a.ifTrue && typeof a.ifTrue === "object") {
      const t = a.ifTrue as TypedAction;
      if (typeof t.from === "string") from.push(t.from);
      if (typeof t.to === "string") to.push(t.to);
    }
    if (a.ifFalse && typeof a.ifFalse === "object") {
      const t = a.ifFalse as TypedAction;
      if (typeof t.from === "string") from.push(t.from);
      if (typeof t.to === "string") to.push(t.to);
    }
  }
  return { from: [...new Set(from)], to: [...new Set(to)] };
}

export function extractFactSemanticGraph(fact: IndependentMechanismFact): FactSemanticGraph {
  const actions = asActions(fact);
  const costs = asCosts(fact);
  const zones = collectZones(actions);
  const roles: FactSemanticGraph["roles"] = {};

  const triggerVal = fact.trigger ?? (fact.condition && !fact.trigger ? fact.condition : undefined);
  if (triggerVal) roles.TRIGGER = triggerVal as string | string[];
  if (fact.condition) roles.CONDITION = String(fact.condition);
  if (costs.length) roles.COST = costs;
  if (fact.target) roles.TARGET = String(fact.target);
  if (fact.subject) roles.ACTOR = String(fact.subject);
  if (fact.event) roles.REPLACEMENT_EFFECT = String(fact.event);
  if (fact.variable) roles.QUANTITY_SCALER = String(fact.variable);
  if (fact.activationRestriction) roles.TIMING_RESTRICTION = String(fact.activationRestriction);

  const actionTypes = actions.map((a) => String(a.type ?? ""));
  if (actionTypes.length) roles.ACTION = actionTypes;
  if (zones.from?.length) roles.FROM_ZONE = zones.from;
  if (zones.to?.length) roles.TO_ZONE = zones.to;

  for (const a of actions) {
    if (a.type === "GRANT_PLAY_PERMISSION") {
      roles.PLAY_CAST_PERMISSION = String(a.object ?? "THAT_CARD");
    }
    if (a.type === "SET_DELAYED_EXILE" || a.type === "DELAYED_SACRIFICE") {
      roles.DELAYED_CONSEQUENCE = String(a.timing ?? a.type);
    }
    if (typeof a.quantity === "string" && /COUNT|X=|UP_TO|COMBAT_DAMAGE|BASE_POWER|EXPERIENCE/i.test(String(a.quantity))) {
      roles.QUANTITY_SCALER = String(a.quantity);
    }
    if (a.type === "CREATE_TOKEN" || a.type === "DRAW_CARD" || a.type === "MILL") {
      roles.OUTPUT = actionTypes.filter((t) =>
        ["CREATE_TOKEN", "DRAW_CARD", "MILL", "PUT_COUNTER", "ADD_MANA", "LOSE_LIFE", "ZONE_MOVE"].includes(t),
      );
    }
  }

  return {
    mechanismId: fact.mechanismId,
    mechanismType: String(fact.mechanismType ?? ""),
    evidenceSpan: fact.evidenceSpan,
    commanderMember: typeof fact.commander === "string" ? fact.commander : undefined,
    roles,
    actions,
    costs,
    trigger: (fact.trigger ?? fact.condition) as string | string[] | undefined,
    target: fact.target as string | undefined,
    condition: fact.condition as string | undefined,
    subject: fact.subject as string | undefined,
    event: fact.event as string | undefined,
    variable: fact.variable as string | undefined,
    activationRestriction: fact.activationRestriction as string | undefined,
    face: fact.face as string | undefined,
  };
}

export function actionTypes(graph: FactSemanticGraph): string[] {
  return graph.actions.map((a) => String(a.type ?? "")).filter(Boolean);
}

export function hasCostPattern(graph: FactSemanticGraph, pattern: RegExp): boolean {
  return graph.costs.some((c) => pattern.test(c));
}

export function triggerMatches(graph: FactSemanticGraph, pattern: RegExp): boolean {
  const parts: string[] = [];
  if (graph.trigger) parts.push(Array.isArray(graph.trigger) ? graph.trigger.join(" ") : graph.trigger);
  if (graph.condition) parts.push(graph.condition);
  if (graph.event) parts.push(graph.event);
  parts.push(graph.evidenceSpan);
  return parts.some((p) => pattern.test(p));
}

export function isKeywordOnlyFact(graph: FactSemanticGraph): boolean {
  return graph.mechanismType === "KEYWORD" && graph.actions.length === 0;
}

export function isChangelingOnly(graph: FactSemanticGraph): boolean {
  return graph.mechanismType === "KEYWORD" && graph.roles.TRIGGER === undefined && graph.evidenceSpan === "Changeling";
}
