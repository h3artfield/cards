/**
 * Policy-aware card-native eligibility for actions without RC3 metadata (e.g. frozen v1.34).
 */
import { segmentAbilities, segmentCardFaces } from "../../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import {
  routeCandidateRegions,
  filterGrantedRulesRoutes,
  filterTokenDefinitionRoutes,
} from "../../src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router";
import { isInsideTokenGlossaryRegion } from "../../src/lib/deck-builder/golden-catalog/oracle-rc3-token-glossary";

export function inferCardNativeLayer2Eligible(input: {
  oracleText: string;
  oracleId: string;
  evidenceStart: number;
  evidenceEnd: number;
  explicit?: boolean;
}): boolean {
  if (input.explicit === false) return false;

  for (const face of segmentCardFaces(input.oracleText)) {
    for (const ability of segmentAbilities(input.oracleId, face.faceId, face.text, face.start)) {
      const absStart = ability.paragraphStart;
      const absEnd = ability.paragraphStart + ability.paragraphText.length;
      if (input.evidenceStart < absStart || input.evidenceEnd > absEnd) continue;

      const localStart = input.evidenceStart - absStart;
      const localEnd = input.evidenceEnd - absStart;

      if (isInsideTokenGlossaryRegion(ability.paragraphText, localStart, localEnd)) return false;

      const routes = routeCandidateRegions(ability.paragraphText, ability.abilityId);
      for (const route of [...filterTokenDefinitionRoutes(routes), ...filterGrantedRulesRoutes(routes)]) {
        if (localStart >= route.span.localStart && localEnd <= route.span.localEnd) return false;
      }
    }
  }
  return true;
}
