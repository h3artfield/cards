import { DECK_MECHANICAL_PROFILE_ONTOLOGY_V1 } from "./deck-evaluation-engine-v1-spec";
import type { DeckInteractionProfileV2_1 } from "../commander-strategy/interaction-profile-v2.1/types";
import type { DeckFeatureBundle } from "../commander-strategy/model-c/deck-features-v1";
import type { DeckSemanticProfile } from "../commander-strategy/types";
import type { CardContributionRecord, DeckMechanicalProfileV1, MechanicalDimensionValue } from "./types";

function readProfileValue(profile: DeckInteractionProfileV2_1, key: string): number {
  if (key.startsWith("ipv2_1_mb_")) return profile.mainboard[key] ?? 0;
  if (key.startsWith("ipv2_1_cmd_")) return profile.commandZone[key] ?? 0;
  return 0;
}

function maxDisruptionAcrossFamilies(
  profile: DeckInteractionProfileV2_1,
  families: string[],
  zone: "mainboard" | "commandZone",
): number {
  const prefix = zone === "mainboard" ? "ipv2_1_mb_" : "ipv2_1_cmd_";
  let max = 0;
  for (const family of families) {
    max = Math.max(max, profile[zone === "mainboard" ? "mainboard" : "commandZone"][`${prefix}${family}_disruption`] ?? 0);
  }
  return max;
}

export function projectMechanicalDimensions(input: {
  interactionProfile: DeckInteractionProfileV2_1;
  featureBundle: DeckFeatureBundle;
}): MechanicalDimensionValue[] {
  const dims: MechanicalDimensionValue[] = [];

  for (const def of DECK_MECHANICAL_PROFILE_ONTOLOGY_V1.interactionDimensions) {
    const mbKeys: string[] = [];
    const cmdKeys: string[] = [];
    for (const family of def.ipv2Families) {
      for (const vector of def.vectors) {
        if (!def.zones || def.zones.includes("mainboard")) {
          mbKeys.push(`ipv2_1_mb_${family}_${vector}`);
        }
        if (!def.zones || def.zones.includes("commandZone")) {
          cmdKeys.push(`ipv2_1_cmd_${family}_${vector}`);
        }
      }
    }

    let value = 0;
    if (def.id === "board_reset") {
      value = Math.max(
        maxDisruptionAcrossFamilies(input.interactionProfile, def.ipv2Families, "mainboard"),
        maxDisruptionAcrossFamilies(input.interactionProfile, def.ipv2Families, "commandZone"),
      );
    } else {
      for (const key of mbKeys) value = Math.max(value, readProfileValue(input.interactionProfile, key));
      for (const key of cmdKeys) value = Math.max(value, readProfileValue(input.interactionProfile, key));
    }

    const rc8Keys = def.rc8Densities ?? [];
    for (const density of rc8Keys) {
      value = Math.max(value, input.featureBundle.semantic[density] ?? 0);
    }

    dims.push({
      id: def.id,
      label: def.label,
      zone: mbKeys.length && cmdKeys.length ? "both" : mbKeys.length ? "mainboard" : "commandZone",
      value,
      sourceKeys: [...mbKeys, ...cmdKeys, ...rc8Keys],
    });
  }

  return dims;
}

export function buildRelianceDimensionMap(profile: DeckInteractionProfileV2_1): Record<string, { mainboard: number; commandZone: number }> {
  const out: Record<string, { mainboard: number; commandZone: number }> = {};
  for (const def of DECK_MECHANICAL_PROFILE_ONTOLOGY_V1.relianceDimensions) {
    const mbKey = def.ipv2Key.replace("{zone}", "mb");
    const cmdKey = def.ipv2Key.replace("{zone}", "cmd");
    out[def.id] = {
      mainboard: def.zones?.includes("mainboard") === false ? 0 : profile.mainboard[mbKey] ?? 0,
      commandZone: def.zones?.includes("mainboard") === false ? 0 : profile.commandZone[cmdKey] ?? 0,
    };
    if (def.id === "tutor_reliance") {
      out[def.id] = {
        mainboard: profile.mainboard["ipv2_1_mb_library_search_reliance"] ?? 0,
        commandZone: 0,
      };
    }
  }
  return out;
}

export function assembleMechanicalProfile(input: {
  interactionProfile: DeckInteractionProfileV2_1;
  featureBundle: DeckFeatureBundle;
  semanticProfile: DeckSemanticProfile | null;
  cardContributions: CardContributionRecord[];
}): DeckMechanicalProfileV1 {
  return {
    profileVersion: "deck-mechanical-profile-v1",
    interactionProfile: input.interactionProfile,
    dimensions: projectMechanicalDimensions({
      interactionProfile: input.interactionProfile,
      featureBundle: input.featureBundle,
    }),
    zoneProfiles: {
      mainboard: { ...input.interactionProfile.mainboard },
      commandZone: { ...input.interactionProfile.commandZone },
    },
    relianceDimensions: buildRelianceDimensionMap(input.interactionProfile),
    structuralSupplements: {
      basicStructure: input.featureBundle.basicStructure,
      gameChanger: input.featureBundle.gameChanger,
      gameChangerAudit: input.featureBundle.gameChangerAudit,
      rc8SemanticAggregate: input.featureBundle.semantic,
    },
    commanderCohesion: input.semanticProfile
      ? {
          commanderSupport: input.semanticProfile.deckInteractionStructure.commanderSupport,
          commanderDependency: input.semanticProfile.deckInteractionStructure.commanderDependency,
          commanderSynergy: input.semanticProfile.deckInteractionStructure.commanderSynergy,
          commanderRedundancy: input.semanticProfile.deckInteractionStructure.commanderRedundancy,
          internalSynergyEdgeCount: input.semanticProfile.deckInteractionStructure.internalSynergyEdgeCount,
          strategyAssignment: input.semanticProfile.strategyAssignment,
        }
      : null,
    cardContributions: input.cardContributions,
  };
}
