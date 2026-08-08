/**
 * RC3 canonical semantic parse entry point.
 */
import { extractOracleActionsRC3 } from "./oracle-action-parser-rc3";
import type { OracleActionV1Result } from "./oracle-action-parser-v1";
import type { OracleSemanticParse } from "./oracle-semantic-parse-schema";
import { validateOracleSemanticParse } from "./oracle-semantic-validator";

export type { OracleSemanticParse } from "./oracle-semantic-parse-schema";
export { validateOracleSemanticParse, evidenceSupportConfidence } from "./oracle-semantic-validator";
export { ORACLE_ACTION_RC3_PARSER_VERSION } from "./oracle-action-parser-rc3";
export {
  stableAbilityId,
  stableOptionId,
  optionOrdinalKey,
  hashOracleText,
} from "./oracle-semantic-parse-schema";
export {
  verifySemanticIdIntegrity,
  verifyProvenanceContainment,
  verifySemanticParseIntegrity,
} from "./oracle-semantic-integrity";

export interface RC3ParseResult extends OracleSemanticParse {
  legacy: OracleActionV1Result;
  semanticValidation: ReturnType<typeof validateOracleSemanticParse>;
}

/** Primary RC3 parse API — semantic model + legacy layers + structural validation. */
export function parseOracleSemanticsRC3(input: {
  oracleId: string;
  oracleText: string;
  cardFace?: string;
  featurePromotion?: boolean;
}): RC3ParseResult {
  const legacy = extractOracleActionsRC3(input);
  const semanticValidation = validateOracleSemanticParse(legacy.semanticParse, input.oracleText);
  return { ...legacy.semanticParse, legacy, semanticValidation };
}
