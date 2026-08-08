/**
 * Benchmark caseScope schema v1.1 — empty-gold certification for all scope types.
 */
import type { OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";

export type CaseScopeType =
  | "full_card"
  | "face"
  | "ability"
  | "modal_option"
  | "clause"
  | "structure_only";

export type GoldCompletenessWithinScope = "complete_within_scope" | "incomplete_within_scope";

export interface CaseScopeFields {
  caseScope: CaseScopeType;
  targetFaceId?: string;
  targetAbilityId?: string;
  targetOptionId?: string;
  targetClauseId?: string;
  goldCompletenessStatus: GoldCompletenessWithinScope;
  certifiedEmptyLayer2: boolean;
  scopeReason: string;
}

const V12_SCOPE_OVERRIDES: Partial<
  Record<string, Omit<CaseScopeFields, "goldCompletenessStatus" | "certifiedEmptyLayer2">>
> = {
  "vh12-0080": {
    caseScope: "ability",
    targetAbilityId: "loyalty-minus-2-exile",
    scopeReason: "Gold scoped to −2 exile loyalty ability only.",
  },
  "vh12-0086": {
    caseScope: "ability",
    targetFaceId: "back",
    targetAbilityId: "loyalty-zero-conditional",
    scopeReason: "Back-face 0: loyalty ability partially gold-scoped.",
  },
  "vh12-0104": {
    caseScope: "clause",
    scopeReason: "Discover reminder parenthetical — mechanic definition, not card-native L2.",
  },
  "vh12-0106": {
    caseScope: "ability",
    scopeReason: "Triggered conditional branch; gold scoped to primary branch.",
  },
  "vh12-0145": {
    caseScope: "full_card",
    scopeReason: "Main spell effect in scope; prior empty gold was benchmark defect.",
  },
  "vh12-0151": {
    caseScope: "full_card",
    scopeReason: "Main spell put_into_hand branch in scope; prior empty gold was defect.",
  },
  "vh12-0148": {
    caseScope: "ability",
    scopeReason: "ETB investigate scoped; granted-ability quote requires explicit ability scope.",
  },
};

function withinScopeGold(testCase: OracleActionEvalCaseV2): Array<{ actionType: string }> {
  return (testCase.expectedPrimitiveActions ?? []).filter((g) => !g.negative);
}

export function inferCaseScopeV11(testCase: OracleActionEvalCaseV2): CaseScopeFields {
  const override = V12_SCOPE_OVERRIDES[testCase.id];
  const gold = withinScopeGold(testCase);

  let base: Omit<CaseScopeFields, "goldCompletenessStatus" | "certifiedEmptyLayer2">;

  if (override) {
    base = { ...override };
  } else if (
    gold.length === 0 &&
    Boolean(testCase.expectedStructure) &&
    !testCase.category?.includes("reminder_heavy")
  ) {
    base = {
      caseScope: "structure_only",
      scopeReason:
        "Layer-1 structure benchmark; certified zero Layer-2 primitives within structure_only scope.",
    };
  } else if (gold.some((g) => (g as { optionId?: string }).optionId)) {
    const opt = gold.find((g) => (g as { optionId?: string }).optionId) as { optionId?: string };
    base = {
      caseScope: "modal_option",
      targetOptionId: opt.optionId,
      scopeReason: "Gold carries modal optionId — scoped to single modal branch.",
    };
  } else if (gold.some((g) => g.loyaltyCost)) {
    const loyalty = gold.find((g) => g.loyaltyCost);
    base = {
      caseScope: "ability",
      targetAbilityId: loyalty?.loyaltyCost ? `loyalty-${loyalty.loyaltyCost}` : undefined,
      scopeReason: "Gold scoped to loyalty ability via loyaltyCost.",
    };
  } else if (testCase.cardFace) {
    base = {
      caseScope: "face",
      targetFaceId: testCase.cardFace,
      scopeReason: "Gold scoped to specific card face.",
    };
  } else if (gold.length === 0) {
    base = {
      caseScope: "structure_only",
      scopeReason: "Zero within-scope Layer-2 gold — requires certifiedEmptyLayer2=true.",
    };
  } else {
    base = {
      caseScope: "full_card",
      scopeReason: "Complete primitive gold within full card oracle text.",
    };
  }

  const isEmpty = gold.length === 0;
  return {
    ...base,
    goldCompletenessStatus: isEmpty && !testCase.expectedStructure ? "incomplete_within_scope" : "complete_within_scope",
    certifiedEmptyLayer2: isEmpty,
  };
}

export function attachCaseScopeV11<T extends OracleActionEvalCaseV2>(testCase: T): T & CaseScopeFields {
  return { ...testCase, ...inferCaseScopeV11(testCase) };
}

export function assertCaseScopeV11(fields: CaseScopeFields): void {
  const goldEmpty = fields.certifiedEmptyLayer2;
  if (goldEmpty && fields.certifiedEmptyLayer2 !== true) {
    throw new Error("Empty within-scope gold requires certifiedEmptyLayer2=true");
  }
}
