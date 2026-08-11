import type { CatalogCoverageSemanticGoldCase, CatalogCoverageExpectedL2Action } from "./semantic-gold-schema";
import type {
  BlindPackCard,
  UiAdjudicationDraft,
  UiAbilityDraft,
  UiActionDraft,
} from "./adjudication-types";
import {
  mapUiAbilityType,
  mapUiExecutionContext,
  mapUiSemanticOwner,
} from "./adjudication-types";
import { CATALOG_COVERAGE_SEMANTIC_GOLD_SCHEMA_VERSION } from "./adjudication-config";
import type { PrimitiveActionType } from "@/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

function mapPrimitive(value: string): PrimitiveActionType | null {
  const allowed: PrimitiveActionType[] = [
    "add_mana",
    "draw",
    "put_into_hand",
    "discard",
    "search_library",
    "deal_damage",
    "destroy",
    "exile",
    "counter",
    "return_to_hand",
    "return_to_battlefield",
    "create_token",
    "cast",
    "play",
    "put_onto_battlefield",
    "copy",
    "sacrifice",
    "mill",
    "gain_life",
    "lose_life",
    "scry",
    "surveil",
    "tap",
    "untap",
    "put_counter",
    "shuffle_library",
    "shuffle_into_library",
  ];
  if (allowed.includes(value as PrimitiveActionType)) return value as PrimitiveActionType;
  return null;
}

function flattenActions(abilities: UiAbilityDraft[]): Array<UiActionDraft & { abilityIndex: number }> {
  const rows: Array<UiActionDraft & { abilityIndex: number }> = [];
  abilities.forEach((ability, abilityIndex) => {
    for (const action of ability.actions) {
      rows.push({ ...action, abilityIndex });
    }
  });
  return rows;
}

export function uiDraftToSemanticGold(input: {
  card: BlindPackCard;
  draft: UiAdjudicationDraft;
}): CatalogCoverageSemanticGoldCase {
  const { card, draft } = input;
  const blank = draft.noCardNativeL2Actions || card.canonicalStructure.combinedOracleText.trim().length === 0;

  if (blank) {
    return {
      schemaVersion: CATALOG_COVERAGE_SEMANTIC_GOLD_SCHEMA_VERSION,
      oracleId: card.oracleId,
      canonicalName: card.canonicalName,
      cardStructureHash: card.cardStructureHash,
      oracleTextHash: card.oracleTextHash,
      layout: card.layout,
      populationCategory: card.populationCategory,
      complexityBucket: card.complexityBucket,
      legitimateCard: true,
      oracleRulesTextEmpty: true,
      expectedCardNativeL2Actions: [],
      abilities: [],
      blankTextGold: {
        legitimateCard: true,
        oracleRulesTextEmpty: true,
        expectedCardNativeL2Actions: [],
        abilities: [],
        expectedWholeCardUnderstanding: "complete_blank_card",
      },
      officialRulingsConsulted: draft.officialRulingsConsulted,
      adjudicationNotes: draft.humanExplanation.trim() || undefined,
    };
  }

  const abilities = draft.abilities.map((ability, abilityIndex) => ({
    abilityIndex,
    faceId: ability.faceId,
    abilityType: mapUiAbilityType(ability.abilityType),
    paragraphText: ability.paragraphText,
    semanticOwner: mapUiSemanticOwner("source_card"),
    executionContext: mapUiExecutionContext("immediate"),
    expectedL2Actions: ability.actions
      .map((action) => {
        const primitive = mapPrimitive(action.primitive);
        if (!primitive) return null;
        return {
          primitive,
          evidenceSpan: {
            text: action.evidenceSpan?.text ?? "",
            start: action.evidenceSpan?.start,
            end: action.evidenceSpan?.end,
            faceId: action.evidenceSpan?.faceId ?? action.faceId,
          },
          optionalEffect: action.optional,
          conditionText: action.conditional ? action.conditionText : undefined,
          semanticOwner: mapUiSemanticOwner(action.semanticOwner),
          executionContext: mapUiExecutionContext(action.executionContext),
          modalOptionId: action.modalOption !== "None" ? action.modalOption : undefined,
          abilityIndex,
        };
      })
      .filter(Boolean) as CatalogCoverageExpectedL2Action[],
  }));

  const expectedCardNativeL2Actions = flattenActions(draft.abilities)
    .map((action) => {
      const primitive = mapPrimitive(action.primitive);
      if (!primitive) return null;
      return {
        primitive,
        evidenceSpan: {
          text: action.evidenceSpan?.text ?? "",
          start: action.evidenceSpan?.start,
          end: action.evidenceSpan?.end,
          faceId: action.evidenceSpan?.faceId ?? action.faceId,
        },
        optionalEffect: action.optional,
        conditionText: action.conditional ? action.conditionText : undefined,
        semanticOwner: mapUiSemanticOwner(action.semanticOwner),
        executionContext: mapUiExecutionContext(action.executionContext),
        modalOptionId: action.modalOption !== "None" ? action.modalOption : undefined,
        abilityIndex: action.abilityIndex,
      };
    })
    .filter(Boolean) as CatalogCoverageExpectedL2Action[];

  return {
    schemaVersion: CATALOG_COVERAGE_SEMANTIC_GOLD_SCHEMA_VERSION,
    oracleId: card.oracleId,
    canonicalName: card.canonicalName,
    cardStructureHash: card.cardStructureHash,
    oracleTextHash: card.oracleTextHash,
    layout: card.layout,
    populationCategory: card.populationCategory,
    complexityBucket: card.complexityBucket,
    legitimateCard: true,
    oracleRulesTextEmpty: false,
    expectedCardNativeL2Actions,
    abilities,
    officialRulingsConsulted: draft.officialRulingsConsulted,
    adjudicationNotes: draft.humanExplanation.trim() || undefined,
  };
}

export function emptyUiDraft(card: BlindPackCard): UiAdjudicationDraft {
  const blank =
    card.populationCategory === "C" || card.canonicalStructure.combinedOracleText.trim().length === 0;
  return {
    noCardNativeL2Actions: blank,
    abilities: [],
    humanExplanation: "",
    officialRulingsConsulted: false,
  };
}
