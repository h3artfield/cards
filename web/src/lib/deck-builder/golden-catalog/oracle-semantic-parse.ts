/**
 * Canonical Oracle semantic parse entry point.
 */
import { extractOracleActionsV1, type OracleActionV1Result } from "./oracle-action-parser-v1";
import type { OracleSemanticParse } from "./oracle-semantic-parse-schema";

export type { OracleSemanticParse } from "./oracle-semantic-parse-schema";
export {
  stableAbilityId,
  stableOptionId,
  optionOrdinalKey,
  hashOracleText,
} from "./oracle-semantic-parse-schema";
export { buildOracleSemanticParse } from "./oracle-semantic-parse-builder";
export { projectLegacyFromSemanticParse, projectSemanticActionToLegacy } from "./oracle-legacy-projection";
export {
  verifySemanticIdIntegrity,
  verifyProvenanceContainment,
  verifySemanticParseIntegrity,
} from "./oracle-semantic-integrity";
export { auditSemanticLegacyParity } from "./oracle-semantic-parity";

/** Primary parse API — returns canonical semantic model plus legacy layers for eval migration. */
export function parseOracleSemantics(input: {
  oracleId: string;
  oracleText: string;
  cardFace?: string;
  featurePromotion?: boolean;
}): OracleSemanticParse & { legacy: OracleActionV1Result } {
  const legacy = extractOracleActionsV1(input);
  return { ...legacy.semanticParse, legacy };
}
