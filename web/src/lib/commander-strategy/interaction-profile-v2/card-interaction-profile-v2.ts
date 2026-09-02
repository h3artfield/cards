/**
 * Card-level Interaction Profile v2 — maps frozen RC8 + catalog to RPS ontology axes.
 */
import type { SemanticAbility, SemanticAction } from "@/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { CardInteractionProfileV2, RpsAxisFamily, RpsVectorKind, ScoredAxisValue } from "./types";
import { CARD_INTERACTION_PROFILE_V2_VERSION } from "./types";
import { assertKnownRc8AbilityType, assertKnownRc8ActionType } from "./rc8-source-registry-v1";
import {
  classifyActionEffect,
  isLandDenial,
  isMassRemoval,
  resolveActionEvidenceText,
  type ActionClassificationContext,
} from "./target-object-classifier-v1";

function bump(
  axes: CardInteractionProfileV2["axes"],
  family: RpsAxisFamily,
  vector: RpsVectorKind,
  delta: number,
  oracleId: string,
  rule: string,
): void {
  if (delta <= 0) return;
  const fam = axes[family] ?? {};
  const cur: ScoredAxisValue = fam[vector] ?? { score: 0, evidence: [] };
  cur.score = Math.min(1, cur.score + delta);
  cur.evidence.push({ oracleId, rule });
  fam[vector] = cur;
  axes[family] = fam;
}

function oracleText(card: GoldenCatalogOracleCard): string {
  return (card.oracleText ?? "").toLowerCase();
}

function combinedSemanticText(card: GoldenCatalogOracleCard, abilities: SemanticAbility[]): string {
  const parts = [oracleText(card), ...abilities.map((a) => a.abilitySpan.text.toLowerCase())];
  return parts.join("\n");
}

function layer1RestrictionSignals(input: {
  oracleId: string;
  card: GoldenCatalogOracleCard;
  abilities: SemanticAbility[];
  axes: CardInteractionProfileV2["axes"];
}): void {
  const text = combinedSemanticText(input.card, input.abilities);
  for (const ability of input.abilities) {
    assertKnownRc8AbilityType(ability.abilityType, input.oracleId);
  }

  // Graveyard hate via replacement / restriction (Layer 1) — NOT mill/discard
  if (
    /\bif a card(?: or token)? would be put into .*graveyard.* exil/i.test(text) ||
    /\bcards can't enter graveyards\b/.test(text) ||
    input.abilities.some((a) => a.abilityType === "replacement" && /graveyard/.test(a.abilitySpan.text.toLowerCase()))
  ) {
    bump(input.axes, "graveyard", "disruption", 0.55, input.oracleId, "layer1:graveyard_replacement_hate");
  }
  if (/\bexile all graveyards\b/.test(text)) {
    bump(input.axes, "graveyard", "disruption", 0.45, input.oracleId, "layer1:exile_all_graveyards");
  }
  if (/\bplayers can't cast spells from graveyards\b/.test(text)) {
    bump(input.axes, "graveyard", "disruption", 0.45, input.oracleId, "layer1:graveyard_cast_restriction");
  }
  if (/\bcards can't leave graveyards\b/.test(text) || /grafdigger/i.test(input.card.canonicalName ?? "")) {
    bump(input.axes, "graveyard", "disruption", 0.5, input.oracleId, "layer1:graveyard_use_restriction");
  }

  // Artifact / activated shutdown
  if (/\bactivated abilities of artifacts can't be activated\b/.test(text)) {
    bump(input.axes, "artifacts", "disruption", 0.5, input.oracleId, "layer1:artifact_activation_shutdown");
    bump(input.axes, "activated_abilities", "disruption", 0.45, input.oracleId, "layer1:artifact_activation_shutdown");
  }
  if (/\bactivated abilities can't be activated\b/.test(text)) {
    bump(input.axes, "activated_abilities", "disruption", 0.5, input.oracleId, "layer1:global_activation_shutdown");
  }

  // Search denial
  if (
    /\bcan't search libraries\b/.test(text) ||
    /\bsearch (?:their )?libraries only on their turn\b/.test(text) ||
    /\bsearch(?:es)? the top (?:four|three|\d+) cards of (?:that|their|a) library instead\b/.test(text)
  ) {
    bump(input.axes, "library_search", "disruption", 0.45, input.oracleId, "layer1:search_denial");
  }

  // Graveyard recursion signals from oracle structure (auras, static)
  if (
    /\benchant .* card in .*graveyard\b/.test(text) ||
    /\bfrom .*graveyard onto the battlefield\b/.test(text)
  ) {
    bump(input.axes, "graveyard", "reliance", 0.35, input.oracleId, "layer1:graveyard_reanimation_structure");
    bump(input.axes, "recursion", "reliance", 0.3, input.oracleId, "layer1:graveyard_reanimation_structure");
  }

  // Spell/ability restrictions
  if (/\bplayers can't cast more than one spell each turn\b/.test(text) || /rule of law/i.test(text)) {
    bump(input.axes, "spells_stack", "disruption", 0.45, input.oracleId, "layer1:spell_rate_restriction");
  }

  // Land color denial
  if (/\bnonbasic lands are mountains\b/.test(text) || /blood moon/i.test(text)) {
    bump(input.axes, "lands", "disruption", 0.55, input.oracleId, "layer1:nonbasic_land_denial");
  }
}

function layer2ActionSignals(input: {
  oracleId: string;
  card: GoldenCatalogOracleCard;
  actions: SemanticAction[];
  abilities: SemanticAbility[];
  axes: CardInteractionProfileV2["axes"];
}): void {
  const ctxBase: Omit<ActionClassificationContext, "actionIndexAmongType"> = {
    oracleText: input.card.oracleText ?? "",
    abilities: input.abilities,
  };
  const typeCounts = new Map<string, number>();

  for (const action of input.actions) {
    assertKnownRc8ActionType(action.actionType, input.oracleId);
    const amongType = typeCounts.get(action.actionType) ?? 0;
    typeCounts.set(action.actionType, amongType + 1);
    const ctx: ActionClassificationContext = { ...ctxBase, actionIndexAmongType: amongType };
    const cls = classifyActionEffect(action, ctx);
    const evidenceText = resolveActionEvidenceText(action, ctx);
    const t = action.actionType;

    if (t === "search_library" || t === "shuffle_library") {
      bump(input.axes, "library_search", "reliance", 0.35, input.oracleId, "l2:search_library");
    }
    if (t === "return_to_battlefield" || t === "put_onto_battlefield") {
      const fromGy =
        (action.arguments.sourceZone ?? []).includes("graveyard") || /from .*graveyard/.test(evidenceText);
      if (fromGy) {
        bump(input.axes, "graveyard", "reliance", 0.4, input.oracleId, "l2:return_from_graveyard");
        bump(input.axes, "recursion", "reliance", 0.35, input.oracleId, "l2:recursion");
      }
    }
    if (t === "mill" || t === "surveil") {
      bump(input.axes, "graveyard", "reliance", 0.2, input.oracleId, "l2:graveyard_setup_self");
    }
    if (t === "create_token") {
      bump(input.axes, "tokens", "reliance", 0.35, input.oracleId, "l2:create_token");
    }
    if (t === "draw" || t === "put_into_hand") {
      bump(input.axes, "hand_resources", "reliance", 0.25, input.oracleId, "l2:card_draw");
    }
    if (t === "add_mana" || t === "untap") {
      bump(input.axes, "mana_acceleration", "reliance", 0.25, input.oracleId, "l2:mana_acceleration");
    }
    if (t === "counter") {
      bump(input.axes, "spells_stack", "disruption", 0.45, input.oracleId, "l2:counterspell");
    }
    if (t === "exile") {
      bump(input.axes, "exile", "disruption", 0.35, input.oracleId, "l2:exile");
      if ((action.arguments.sourceZone ?? []).includes("graveyard") || cls.objectClass === "graveyard_card") {
        bump(input.axes, "graveyard", "disruption", 0.4, input.oracleId, "l2:exile_from_graveyard");
      }
    }
    if (t === "destroy") {
      if (isMassRemoval(action, ctx)) {
        bump(input.axes, "creatures", "disruption", 0.45, input.oracleId, "l2:mass_creature_removal");
        bump(input.axes, "tokens", "disruption", 0.4, input.oracleId, "l2:board_reset");
      } else if (cls.objectClass === "artifact" || /\bartifact or enchantment\b/.test(evidenceText)) {
        bump(input.axes, "artifacts", "disruption", 0.4, input.oracleId, "l2:artifact_removal");
        if (/\benchantment\b/.test(evidenceText)) {
          bump(input.axes, "enchantments", "disruption", 0.4, input.oracleId, "l2:enchantment_removal");
        }
      } else if (cls.objectClass === "enchantment") {
        bump(input.axes, "enchantments", "disruption", 0.4, input.oracleId, "l2:enchantment_removal");
      } else if (cls.objectClass === "creature") {
        bump(input.axes, "creatures", "disruption", 0.35, input.oracleId, "l2:spot_creature_removal");
      } else if (isLandDenial(action, ctx)) {
        bump(input.axes, "lands", "disruption", 0.45, input.oracleId, "l2:land_denial");
      }
    }
    if (t === "discard") {
      bump(input.axes, "hand_resources", "disruption", 0.3, input.oracleId, "l2:hand_disruption");
    }
    if (t === "sacrifice") {
      bump(input.axes, "creatures", "reliance", 0.15, input.oracleId, "l2:sacrifice_outlet_or_cost");
    }
  }
}

function catalogExposureSignals(input: {
  oracleId: string;
  card: GoldenCatalogOracleCard;
  axes: CardInteractionProfileV2["axes"];
}): void {
  const tl = (input.card.typeLine ?? "").toLowerCase();
  // Exposure only — NOT reliance
  if (/\bcreature\b/.test(tl)) bump(input.axes, "creatures", "exposure", 0.15, input.oracleId, "catalog:type_creature");
  if (/\bartifact\b/.test(tl)) bump(input.axes, "artifacts", "exposure", 0.15, input.oracleId, "catalog:type_artifact");
  if (/\benchantment\b/.test(tl)) bump(input.axes, "enchantments", "exposure", 0.15, input.oracleId, "catalog:type_enchantment");
  if (/\bland\b/.test(tl)) bump(input.axes, "lands", "exposure", 0.15, input.oracleId, "catalog:type_land");
  if (/\binstant\b|\bsorcery\b/.test(tl)) bump(input.axes, "spells_stack", "exposure", 0.1, input.oracleId, "catalog:type_spell");
}

function abilityStructureSignals(input: {
  oracleId: string;
  abilities: SemanticAbility[];
  axes: CardInteractionProfileV2["axes"];
}): void {
  for (const ability of input.abilities) {
    if (ability.abilityType === "activated") {
      bump(input.axes, "activated_abilities", "reliance", 0.25, input.oracleId, "l1:activated_ability");
    }
    if (ability.abilityType === "triggered") {
      bump(input.axes, "triggered_abilities", "reliance", 0.25, input.oracleId, "l1:triggered_ability");
    }
    if (ability.abilityType === "replacement") {
      bump(input.axes, "graveyard", "resilience", 0.2, input.oracleId, "l1:replacement_resilience");
    }
  }
}

export function buildCardInteractionProfileV2(input: {
  oracleId: string;
  card: GoldenCatalogOracleCard;
  actions: SemanticAction[];
  abilities: SemanticAbility[];
}): CardInteractionProfileV2 {
  const axes: CardInteractionProfileV2["axes"] = {};
  catalogExposureSignals({ oracleId: input.oracleId, card: input.card, axes });
  abilityStructureSignals({ oracleId: input.oracleId, abilities: input.abilities, axes });
  layer1RestrictionSignals({
    oracleId: input.oracleId,
    card: input.card,
    abilities: input.abilities,
    axes,
  });
  layer2ActionSignals({
    oracleId: input.oracleId,
    card: input.card,
    actions: input.actions,
    abilities: input.abilities,
    axes,
  });
  return {
    oracleId: input.oracleId,
    profileVersion: CARD_INTERACTION_PROFILE_V2_VERSION,
    axes,
  };
}

export function cardProfileToFlatScores(profile: CardInteractionProfileV2): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [family, vectors] of Object.entries(profile.axes)) {
    for (const [vector, val] of Object.entries(vectors ?? {})) {
      out[`${family}_${vector}`] = (val as ScoredAxisValue).score;
    }
  }
  return out;
}
