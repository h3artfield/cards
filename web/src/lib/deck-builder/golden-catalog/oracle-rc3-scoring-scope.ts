/**
 * Card-native L2 scoring scope — token-definition boundaries fence legacy leakage.
 */
import { segmentAbilities, segmentCardFaces } from "./oracle-ability-segmentation";
import type { OracleActionV1 } from "./oracle-action-parser-v1";
import {
  filterGrantedRulesRoutes,
  filterTokenDefinitionRoutes,
  routeCandidateRegions,
} from "./oracle-rc3-semantic-context-router";
import { isInsideTokenGlossaryRegion } from "./oracle-rc3-token-glossary";
import {
  isTokenDefinitionRegionId,
  type ExtractionSource,
  type ExecutionContext,
  type RC3ActionExtensions,
  type SemanticOwner,
} from "./oracle-rc3-extraction-metadata";

export type ActionScoringScope = {
  extractionSource?: ExtractionSource;
  executionContext: ExecutionContext;
  semanticOwner: SemanticOwner;
  cardNativeLayer2Eligible: boolean;
};

function spanInsideTokenDefinitionRegion(
  oracleText: string,
  oracleId: string,
  evidenceStart: number,
  evidenceEnd: number,
): boolean {
  for (const face of segmentCardFaces(oracleText)) {
    for (const ability of segmentAbilities(oracleId, face.faceId, face.text, face.start)) {
      const absStart = ability.paragraphStart;
      const absEnd = ability.paragraphStart + ability.paragraphText.length;
      if (evidenceStart < absStart || evidenceEnd > absEnd) continue;

      const localStart = evidenceStart - absStart;
      const localEnd = evidenceEnd - absStart;

      if (isInsideTokenGlossaryRegion(ability.paragraphText, localStart, localEnd)) return true;

      const routes = routeCandidateRegions(ability.paragraphText, ability.abilityId);
      for (const route of filterTokenDefinitionRoutes(routes)) {
        if (localStart >= route.span.localStart && localEnd <= route.span.localEnd) return true;
      }
    }
  }
  return false;
}

function spanInsideGrantedRulesRegion(
  oracleText: string,
  oracleId: string,
  evidenceStart: number,
  evidenceEnd: number,
): boolean {
  for (const face of segmentCardFaces(oracleText)) {
    for (const ability of segmentAbilities(oracleId, face.faceId, face.text, face.start)) {
      const absStart = ability.paragraphStart;
      const absEnd = ability.paragraphStart + ability.paragraphText.length;
      if (evidenceStart < absStart || evidenceEnd > absEnd) continue;
      const localStart = evidenceStart - absStart;
      const localEnd = evidenceEnd - absStart;
      const routes = routeCandidateRegions(ability.paragraphText, ability.abilityId);
      for (const route of filterGrantedRulesRoutes(routes)) {
        if (localStart >= route.span.localStart && localEnd <= route.span.localEnd) return true;
      }
    }
  }
  return false;
}

/** Resolve scoring metadata for a legacy/clause-native action. */
export function resolveActionScoringScope(
  action: OracleActionV1 & RC3ActionExtensions,
  oracleText: string,
): ActionScoringScope {
  const ext = action;
  const executionContext: ExecutionContext = ext.executionContext ?? "immediate";

  if (
    executionContext === "token_definition" ||
    isTokenDefinitionRegionId(ext.grantedAbilityId) ||
    spanInsideTokenDefinitionRegion(oracleText, action.oracleId, action.evidenceStart, action.evidenceEnd)
  ) {
    return {
      extractionSource: ext.extractionSource,
      executionContext: "token_definition",
      semanticOwner: "created_object",
      cardNativeLayer2Eligible: false,
    };
  }

  if (executionContext === "granted_ability" || spanInsideGrantedRulesRegion(oracleText, action.oracleId, action.evidenceStart, action.evidenceEnd)) {
    return {
      extractionSource: ext.extractionSource,
      executionContext: "granted_ability",
      semanticOwner: "granted_object",
      cardNativeLayer2Eligible: ext.cardNativeLayer2Eligible ?? true,
    };
  }

  return {
    extractionSource: ext.extractionSource,
    executionContext: "immediate",
    semanticOwner: ext.semanticOwner ?? "source_card",
    cardNativeLayer2Eligible: true,
  };
}
