/**
 * Gold Policy v1.8 adjudication — extends frozen v1.7 with structural gap repairs.
 */
export * from "./validation-v13-policy-adjudication";
import type { OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";
import type { ExpectedPrimitiveAction } from "../audit-oracle-action-eval-cases";
import {
  classifyCastGold as classifyCastGoldV17,
  classifySacrificeDiscardGold as classifySacrificeDiscardGoldV17,
} from "./validation-v13-policy-adjudication";
import {
  adjudicateCastGoldV18Extensions,
  adjudicateSacrificeDiscardGoldV18Extensions,
} from "./gold-policy-adjudication-v1.8-extensions";

export function classifyCastGold(input: {
  testCase: OracleActionEvalCaseV2;
  gold: ExpectedPrimitiveAction;
}) {
  return adjudicateCastGoldV18Extensions(input) ?? classifyCastGoldV17(input);
}

export function classifySacrificeDiscardGold(input: {
  testCase: OracleActionEvalCaseV2;
  gold: ExpectedPrimitiveAction;
}) {
  return adjudicateSacrificeDiscardGoldV18Extensions(input) ?? classifySacrificeDiscardGoldV17(input);
}
