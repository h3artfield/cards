/**
 * Deterministic semantic-opportunity fidelity checks — beyond oracleSpan equality.
 */
import type { IndependentMechanismFact } from "../../src/lib/deck-synthesis/independent-truth-types-v1";
import type { SemanticOpportunity } from "../../src/lib/deck-synthesis/semantic-opportunity-types-v1";

export const SEMANTIC_OPPORTUNITY_FIDELITY_AUDIT_V1_VERSION =
  "phase6a1-semantic-opportunity-fidelity-audit-v1";

const FORBIDDEN_BROADENING_PHRASES = [
  "additional land drop",
  "extra land drop",
  "additional land play",
  "extra land play",
  "grants an additional land",
  "grants an extra land",
] as const;

const ACTION_TYPE_PATTERN =
  /\b(PLAY_FROM_GRAVEYARD|CAST_FROM_GRAVEYARD|CREATE_TOKEN|DEAL_DAMAGE|PUT_COUNTER|ADD_MANA)\b/g;

function actionList(fact: IndependentMechanismFact): Array<Record<string, unknown>> {
  return Array.isArray(fact.actions) ? (fact.actions as Array<Record<string, unknown>>) : [];
}

function sourceActionTypes(fact: IndependentMechanismFact): Set<string> {
  return new Set(actionList(fact).map((a) => String(a.type)));
}

function opportunityTextFields(opp: SemanticOpportunity): string[] {
  return [
    opp.causalStatement,
    opp.requiredStateOrAction,
    opp.expectedMechanicalEffect,
    opp.semanticEdge,
    ...(opp.causalProof ?? []),
  ].filter((x): x is string => typeof x === "string" && x.length > 0);
}

export type SemanticOpportunityFidelityIssue = {
  opportunityId: string;
  code:
    | "FORBIDDEN_BROADENING_PHRASE"
    | "UNSUPPORTED_ACTION_CLAIM"
    | "UNSUPPORTED_COUNTER_CLAIM"
    | "UNSUPPORTED_CREATURE_TYPE"
    | "SCOPE_ACTION_MISMATCH";
  message: string;
  field?: string;
};

export function auditOpportunitySemanticFidelity(args: {
  opportunity: SemanticOpportunity;
  sourceFacts: IndependentMechanismFact[];
}): SemanticOpportunityFidelityIssue[] {
  const issues: SemanticOpportunityFidelityIssue[] = [];
  const sourceFactIds = [
    ...new Set([...(args.opportunity.sourceMechanismFactIds ?? []), ...(args.opportunity.sourceFactIds ?? [])]),
  ];
  const facts = sourceFactIds
    .map((id) => args.sourceFacts.find((f) => f.mechanismId === id))
    .filter((f): f is IndependentMechanismFact => Boolean(f));
  if (facts.length === 0) {
    issues.push({
      opportunityId: args.opportunity.opportunityId,
      code: "UNSUPPORTED_ACTION_CLAIM",
      message: "No resolvable source mechanism facts for fidelity audit",
    });
    return issues;
  }

  const mergedActionTypes = new Set<string>();
  for (const fact of facts) {
    for (const t of sourceActionTypes(fact)) mergedActionTypes.add(t);
  }

  for (const fieldText of opportunityTextFields(args.opportunity)) {
    const lower = fieldText.toLowerCase();
    for (const phrase of FORBIDDEN_BROADENING_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push({
          opportunityId: args.opportunity.opportunityId,
          code: "FORBIDDEN_BROADENING_PHRASE",
          message: `Forbidden broadening phrase "${phrase}"`,
          field: fieldText,
        });
      }
    }
  }

  const mentionsCounter =
    /\+1\/\+1 counter|put_counter|x \+1\/\+1|x \+\s*1\/\+\s*1/i.test(
      opportunityTextFields(args.opportunity).join(" "),
    );
  if (mentionsCounter && !mergedActionTypes.has("PUT_COUNTER")) {
    issues.push({
      opportunityId: args.opportunity.opportunityId,
      code: "UNSUPPORTED_COUNTER_CLAIM",
      message: "Opportunity mentions counters but source fact has no PUT_COUNTER action",
    });
  }

  for (const fieldText of opportunityTextFields(args.opportunity)) {
    const claimedActions = [...fieldText.matchAll(ACTION_TYPE_PATTERN)].map((m) => m[1]!);
    for (const claimed of claimedActions) {
      if (!mergedActionTypes.has(claimed)) {
        issues.push({
          opportunityId: args.opportunity.opportunityId,
          code: "UNSUPPORTED_ACTION_CLAIM",
          message: `Opportunity cites action ${claimed} not present on source mechanism fact`,
          field: fieldText,
        });
      }
    }
  }

  const scopes = args.opportunity.exactScopes ?? {};
  if (scopes.counterType || scopes.scaling || scopes.recipient) {
    if (!mergedActionTypes.has("PUT_COUNTER")) {
      issues.push({
        opportunityId: args.opportunity.opportunityId,
        code: "UNSUPPORTED_COUNTER_CLAIM",
        message: "exactScopes include counter fields but source fact has no PUT_COUNTER action",
      });
    }
  }

  if (scopes.object && typeof scopes.object === "string") {
    const objectScope = scopes.object.toUpperCase();
    const supportedObjects = new Set<string>();
    for (const fact of facts) {
      for (const action of actionList(fact)) {
        if (action.object) supportedObjects.add(String(action.object).toUpperCase());
        if (action.token) supportedObjects.add(String(action.token).toUpperCase());
      }
      if (fact.target) supportedObjects.add(String(fact.target).toUpperCase());
      const trigger = String(fact.trigger ?? "").toUpperCase();
      if (trigger.includes(objectScope.replace(/_/g, " ")) || trigger.includes(objectScope)) {
        supportedObjects.add(objectScope);
      }
    }
    const triggerScope = typeof scopes.trigger === "string" ? scopes.trigger.toUpperCase() : "";
    const objectSupported =
      supportedObjects.has(objectScope) ||
      [...supportedObjects].some((obj) => objectScope.includes(obj) || obj.includes(objectScope)) ||
      triggerScope.includes(objectScope);
    if (!objectSupported && !["LAND", "PERMANENT_SPELL", "LAND_CARD"].includes(objectScope)) {
      issues.push({
        opportunityId: args.opportunity.opportunityId,
        code: "UNSUPPORTED_CREATURE_TYPE",
        message: `exactScopes.object=${scopes.object} not supported by source mechanism object/token fields`,
      });
    }
  }

  for (const fact of facts) {
    for (const action of actionList(fact)) {
      if (action.type === "PLAY_FROM_GRAVEYARD" && action.object === "LAND_CARD") {
        if (scopes.perTurnLimit && String(scopes.perTurnLimit).toLowerCase().includes("additional")) {
          issues.push({
            opportunityId: args.opportunity.opportunityId,
            code: "SCOPE_ACTION_MISMATCH",
            message: "Land graveyard permission must not encode an additional land-play grant",
          });
        }
      }
    }
  }

  return issues;
}

export function auditCaseOpportunitySemanticFidelity(args: {
  opportunities: SemanticOpportunity[];
  sourceFacts: IndependentMechanismFact[];
}): SemanticOpportunityFidelityIssue[] {
  return args.opportunities.flatMap((opportunity) =>
    auditOpportunitySemanticFidelity({ opportunity, sourceFacts: args.sourceFacts }),
  );
}
