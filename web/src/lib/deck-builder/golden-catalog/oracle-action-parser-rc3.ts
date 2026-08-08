/**
 * RC3 parser lineage — descends from semantic architecture, separate from frozen RC2.
 * Does NOT modify oracle-action-parser-v1.ts (RC2 blob remains immutable).
 */
import { extractOracleActionsV1, type OracleActionV1Result } from "./oracle-action-parser-v1";
import { applyRC3Transforms, ORACLE_ACTION_RC3_PARSER_VERSION } from "./oracle-rc3-transform";

export { ORACLE_ACTION_RC3_PARSER_VERSION };

/** RC3 extraction — V1 baseline + structural AST transforms. */
export function extractOracleActionsRC3(input: {
  oracleId: string;
  oracleText: string;
  cardFace?: string;
  featurePromotion?: boolean;
}): OracleActionV1Result {
  const base = extractOracleActionsV1(input);
  return applyRC3Transforms(base, input);
}
