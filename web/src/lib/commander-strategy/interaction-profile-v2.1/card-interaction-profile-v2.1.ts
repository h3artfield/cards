/**
 * Card-level Interaction Profile v2.1 — tightened reliance semantics.
 * Reuses frozen RC8 registry + target classifier from v2.
 */
import type { SemanticAbility, SemanticAction } from "@/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import { assertKnownRc8AbilityType, assertKnownRc8ActionType } from "../interaction-profile-v2/rc8-source-registry-v1";
import {
  classifyActionEffect,
  isLandDenial,
  isMassRemoval,
  resolveActionEvidenceText,
  type ActionClassificationContext,
} from "../interaction-profile-v2/target-object-classifier-v1";
import type { CardInteractionProfileV2_1, RpsAxisFamily, RpsVectorKind, ScoredAxisValue } from "./types";
import { CARD_INTERACTION_PROFILE_V2_1_VERSION } from "./types";
import { isRetainedAxis } from "./rps-ontology-v2.1";

function bump(
  axes: CardInteractionProfileV2_1["axes"],
  family: RpsAxisFamily,
  vector: RpsVectorKind,
  delta: number,
  oracleId: string,
  rule: string,
  zoneHint: "mb" | "cmd" = "mb",
): void {
  if (delta <= 0) return;
  if (!isRetainedAxis(zoneHint, family, vector)) return;
  const fam = axes[family] ?? {};
  const cur: ScoredAxisValue = fam[vector] ?? { score: 0, evidence: [] };
  cur.score = Math.min(1, cur.score + delta);
  cur.evidence.push({ oracleId, rule });
  fam[vector] = cur;
  axes[family] = fam;
}

function combinedSemanticText(card: GoldenCatalogOracleCard, abilities: SemanticAbility[]): string {
  return [(card.oracleText ?? "").toLowerCase(), ...abilities.map((a) => a.abilitySpan.text.toLowerCase())].join("\n");
}

function isBasicLand(card: GoldenCatalogOracleCard): boolean {
  return /\bbasic\b.*\bland\b/.test((card.typeLine ?? "").toLowerCase());
}

function layer1RestrictionSignals(input: {
  oracleId: string;
  card: GoldenCatalogOracleCard;
  abilities: SemanticAbility[];
  axes: CardInteractionProfileV2_1["axes"];
}): void {
  const text = combinedSemanticText(input.card, input.abilities);
  for (const ability of input.abilities) assertKnownRc8AbilityType(ability.abilityType, input.oracleId);

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
  if (/\bactivated abilities of artifacts can't be activated\b/.test(text)) {
    bump(input.axes, "artifacts", "disruption", 0.5, input.oracleId, "layer1:artifact_activation_shutdown");
    bump(input.axes, "activated_abilities", "disruption", 0.45, input.oracleId, "layer1:artifact_activation_shutdown");
  }
  if (/\bactivated abilities can't be activated\b/.test(text)) {
    bump(input.axes, "activated_abilities", "disruption", 0.5, input.oracleId, "layer1:global_activation_shutdown");
  }
  if (
    /\bcan't search libraries\b/.test(text) ||
    /\bsearch (?:their )?libraries only on their turn\b/.test(text) ||
    /\bsearch(?:es)? the top (?:four|three|\d+) cards of (?:that|their|a) library instead\b/.test(text)
  ) {
    bump(input.axes, "library_search", "disruption", 0.45, input.oracleId, "layer1:search_denial");
  }
  if (
    /\benchant .* card in .*graveyard\b/.test(text) ||
    /\bfrom .*graveyard onto the battlefield\b/.test(text)
  ) {
    bump(input.axes, "graveyard", "reliance", 0.35, input.oracleId, "layer1:graveyard_reanimation_structure");
    bump(input.axes, "recursion", "reliance", 0.3, input.oracleId, "layer1:graveyard_reanimation_structure");
  }
  if (/\bplayers can't cast more than one spell each turn\b/.test(text) || /rule of law/i.test(text)) {
    bump(input.axes, "spells_stack", "disruption", 0.45, input.oracleId, "layer1:spell_rate_restriction");
  }
  if (/\bnonbasic lands are mountains\b/.test(text) || /blood moon/i.test(text)) {
    bump(input.axes, "lands", "disruption", 0.55, input.oracleId, "layer1:nonbasic_land_denial");
  }
}

function engineRelianceSignals(input: {
  oracleId: string;
  card: GoldenCatalogOracleCard;
  abilities: SemanticAbility[];
  axes: CardInteractionProfileV2_1["axes"];
}): void {
  const text = combinedSemanticText(input.card, input.abilities);
  const tl = (input.card.typeLine ?? "").toLowerCase();

  // Artifact synergy reliance (not mere artifact type)
  if (
    /\bfor each artifact\b/.test(text) ||
    /\bartifacts you control\b/.test(text) ||
    /\bsacrifice an artifact\b/.test(text) ||
    /\bsacrifice .* artifact\b/.test(text) ||
    /\bequip\b/.test(text) ||
    /\baffinity for artifacts\b/.test(text)
  ) {
    bump(input.axes, "artifacts", "reliance", 0.35, input.oracleId, "engine:artifact_synergy");
  }

  // Spell-chain reliance (not merely being an instant)
  if (
    /\bwhen you cast (?:an )?(?:instant|sorcery|spell)\b/.test(text) ||
    /\bmagecraft\b/.test(text) ||
    /\bprowess\b/.test(text) ||
    /\bstorm\b/.test(text) ||
    /\bcopy (?:it|that spell|target (?:instant|sorcery|spell))\b/.test(text)
  ) {
    bump(input.axes, "spells_stack", "reliance", 0.35, input.oracleId, "engine:spell_chain");
  }

  // Creature-plan reliance
  if (
    /\bwhenever a creature (?:enters|dies)\b/.test(text) ||
    /\bwhen a creature (?:enters|dies)\b/.test(text) ||
    /\baristocrats\b/i.test(input.card.canonicalName ?? "") ||
    (/\bsacrifice a creature\b/.test(text) && !/\bsacrifice a creature:.*destroy target creature\b/.test(text))
  ) {
    bump(input.axes, "creatures", "reliance", 0.3, input.oracleId, "engine:creature_plan");
  }

  // Draw engine reliance
  if (
    (/\bdraw (?:a |one |two |three |\d+ )cards?\b/.test(text) && /\bwhenever\b/.test(text)) ||
    /\bat the beginning of your (?:upkeep|draw step).*draw\b/.test(text) ||
    /\bwhenever you draw\b/.test(text)
  ) {
    bump(input.axes, "hand_resources", "reliance", 0.35, input.oracleId, "engine:draw_engine");
  }

  // Activated engine (exclude basic land tap)
  const activatedCount = input.abilities.filter((a) => a.abilityType === "activated").length;
  const nonLand = !/\bland\b/.test(tl) || /\bartifact\b/.test(tl);
  if (nonLand && activatedCount >= 1) {
    const hasEngineActivated =
      /\bdraw a card\b/.test(text) ||
      /\badd \{/.test(text) && !isBasicLand(input.card) ||
      /\buntap target/.test(text) ||
      activatedCount >= 2;
    if (hasEngineActivated && !isBasicLand(input.card)) {
      bump(input.axes, "activated_abilities", "reliance", 0.3, input.oracleId, "engine:activated_engine");
    }
  }

  // Triggered engine reliance
  const triggeredPayoff =
    /\bwhenever\b/.test(text) &&
    (/\bdraw\b/.test(text) || /\bdamage\b/.test(text) || /\bcreate .* token\b/.test(text) || /\bgain .* life\b/.test(text));
  if (triggeredPayoff) {
    bump(input.axes, "triggered_abilities", "reliance", 0.28, input.oracleId, "engine:triggered_payoff");
  }
}

function layer2ActionSignals(input: {
  oracleId: string;
  card: GoldenCatalogOracleCard;
  actions: SemanticAction[];
  abilities: SemanticAbility[];
  axes: CardInteractionProfileV2_1["axes"];
}): void {
  const ctxBase: Omit<ActionClassificationContext, "actionIndexAmongType"> = {
    oracleText: input.card.oracleText ?? "",
    abilities: input.abilities,
  };
  const typeCounts = new Map<string, number>();
  const tl = (input.card.typeLine ?? "").toLowerCase();

  for (const action of input.actions) {
    assertKnownRc8ActionType(action.actionType, input.oracleId);
    const amongType = typeCounts.get(action.actionType) ?? 0;
    typeCounts.set(action.actionType, amongType + 1);
    const ctx: ActionClassificationContext = { ...ctxBase, actionIndexAmongType: amongType };
    const cls = classifyActionEffect(action, ctx);
    const evidenceText = resolveActionEvidenceText(action, ctx);
    const t = action.actionType;

    if (t === "search_library") {
      bump(input.axes, "library_search", "reliance", 0.35, input.oracleId, "l2:search_library");
      if (/land/.test(evidenceText) || /\bsearch your library for a (?:basic )?land\b/.test(evidenceText)) {
        bump(input.axes, "mana_acceleration", "reliance", 0.3, input.oracleId, "l2:ramp_search");
      }
    }
    if (t === "return_to_battlefield" || t === "put_onto_battlefield") {
      const fromGy =
        (action.arguments.sourceZone ?? []).includes("graveyard") || /from .*graveyard/.test(evidenceText);
      if (fromGy) {
        bump(input.axes, "graveyard", "reliance", 0.4, input.oracleId, "l2:return_from_graveyard");
        bump(input.axes, "recursion", "reliance", 0.35, input.oracleId, "l2:recursion");
      }
      if (/land/.test(evidenceText)) {
        bump(input.axes, "mana_acceleration", "reliance", 0.3, input.oracleId, "l2:ramp_put_land");
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
    if ((t === "add_mana" || t === "untap") && !isBasicLand(input.card) && !/\bland\b/.test(tl)) {
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
  axes: CardInteractionProfileV2_1["axes"];
}): void {
  const tl = (input.card.typeLine ?? "").toLowerCase();
  if (/\bcreature\b/.test(tl)) bump(input.axes, "creatures", "exposure", 0.15, input.oracleId, "catalog:type_creature");
  if (/\bartifact\b/.test(tl)) bump(input.axes, "artifacts", "exposure", 0.15, input.oracleId, "catalog:type_artifact");
  if (/\benchantment\b/.test(tl)) bump(input.axes, "enchantments", "exposure", 0.15, input.oracleId, "catalog:type_enchantment");
  if (/\bland\b/.test(tl)) bump(input.axes, "lands", "exposure", 0.15, input.oracleId, "catalog:type_land");
}

export function buildCardInteractionProfileV2_1(input: {
  oracleId: string;
  card: GoldenCatalogOracleCard;
  actions: SemanticAction[];
  abilities: SemanticAbility[];
}): CardInteractionProfileV2_1 {
  const axes: CardInteractionProfileV2_1["axes"] = {};
  catalogExposureSignals({ oracleId: input.oracleId, card: input.card, axes });
  engineRelianceSignals({
    oracleId: input.oracleId,
    card: input.card,
    abilities: input.abilities,
    axes,
  });
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
    profileVersion: CARD_INTERACTION_PROFILE_V2_1_VERSION,
    axes,
  };
}

export function cardProfileToFlatScores(profile: CardInteractionProfileV2_1): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [family, vectors] of Object.entries(profile.axes)) {
    for (const [vector, val] of Object.entries(vectors ?? {})) {
      out[`${family}_${vector}`] = (val as ScoredAxisValue).score;
    }
  }
  return out;
}
