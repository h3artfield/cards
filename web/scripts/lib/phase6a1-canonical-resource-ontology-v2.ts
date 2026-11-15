/**
 * Canonical typed resource ontology v2 — head-resource classification with qualifier-preserving compatibility.
 */
import type { SemanticPackage } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";

export const CANONICAL_RESOURCE_ONTOLOGY_V2_VERSION = "phase6a1-canonical-resource-ontology-v2";

export type CanonicalResourceType =
  | "UNBOUNDED_MANA"
  | "BOUNDED_MANA"
  | "REANIMATION_MANA_COST"
  | "RECURSION_MANA_COST"
  | "NONLAND_MANA_PERMANENT"
  | "UNTAP_RESET"
  | "SCALABLE_MANA_OUTLET"
  | "ENCHANTMENT_SPELL_ACCESS"
  | "ENCHANTMENT_CAST_EVENT"
  | "ENCHANTMENT_PERMANENT"
  | "ENCHANTMENT_TOKEN"
  | "SPIRIT_TOKEN"
  | "CREATURE_TOKEN"
  | "CREATURE_DEPLOYMENT"
  | "CREATURE_CARD_GRAVEYARD"
  | "RECOVERED_CREATURE"
  | "TOPDECK_ACCESS"
  | "TOPDECK_RECURSION"
  | "GRAVEYARD_SETUP"
  | "RECURSION_TARGET"
  | "SACRIFICE_OUTLET"
  | "SACRIFICE_PAYOFF"
  | "POWER_FOUR_PLUS_ATTACKER"
  | "QUALIFYING_ATTACKER"
  | "COMBAT_ACCESS"
  | "COMBAT_DAMAGE"
  | "EXPERIENCE_COUNTER"
  | "CARD_SELECTION"
  | "CARD_ADVANTAGE"
  | "TOKEN_AMPLIFIER"
  | "PROTECTION_INTERACTION"
  | "REANIMATION_TARGET";

export type ResourceZone = "GRAVEYARD" | "HAND" | "BATTLEFIELD" | "LIBRARY" | "GENERAL";
export type ResourcePotency = "UNBOUNDED" | "BOUNDED" | "LARGE";

export type ResourceQualifiers = {
  zone: ResourceZone;
  potency?: ResourcePotency;
  powerQualified: boolean;
  objectKind: "MANA" | "CREATURE_CARD" | "CREATURE_TOKEN" | "SPELL" | "TARGET" | "ACCESS" | "OTHER";
};

export type ClassifiedResource = {
  type: CanonicalResourceType;
  field: "requiredResources" | "producedResources" | "payoffs" | "semanticRequirements";
  index: number;
  text: string;
  qualifiers: ResourceQualifiers;
  headResource: string;
};

const MANA_TYPES = new Set<CanonicalResourceType>([
  "UNBOUNDED_MANA",
  "BOUNDED_MANA",
  "REANIMATION_MANA_COST",
  "RECURSION_MANA_COST",
  "NONLAND_MANA_PERMANENT",
]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractQualifiers(text: string): ResourceQualifiers {
  const t = normalize(text);
  let zone: ResourceZone = "GENERAL";
  if (/in the graveyard|graveyard targets|creature cards in the graveyard|legal creature target in the graveyard/.test(t)) {
    zone = "GRAVEYARD";
  } else if (/in hand|from hand/.test(t)) {
    zone = "HAND";
  } else if (/on the battlefield|battlefield deployment|recovered creature card in hand or on the battlefield/.test(t)) {
    zone = "BATTLEFIELD";
  } else if (/top of the library|top-card|topdeck/.test(t)) {
    zone = "LIBRARY";
  }

  let potency: ResourcePotency | undefined;
  if (/unbounded mana|large or unbounded mana/.test(t)) potency = "UNBOUNDED";
  else if (/\bmana\b/.test(t)) potency = "BOUNDED";

  const powerQualified = /power-4|power 4|4\/4|threshold-compatible|power-4-plus/.test(t);

  let objectKind: ResourceQualifiers["objectKind"] = "OTHER";
  if (/\bmana\b/.test(t)) objectKind = "MANA";
  else if (/creature card|creature cards/.test(t)) objectKind = "CREATURE_CARD";
  else if (/creature token|creature tokens/.test(t)) objectKind = "CREATURE_TOKEN";
  else if (/enchantment spell|castable enchantment/.test(t)) objectKind = "SPELL";
  else if (/reanimation target|prepared reanimation|recovered creature/.test(t)) objectKind = "TARGET";
  else if (/access|combat-access|combat step/.test(t)) objectKind = "ACCESS";

  return { zone, potency, powerQualified, objectKind };
}

function headResourceLabel(text: string, type: CanonicalResourceType): string {
  return `${type}:${normalize(text).slice(0, 80)}`;
}

function classifyLine(text: string, field: ClassifiedResource["field"], index: number): ClassifiedResource[] {
  const t = normalize(text);
  const qualifiers = extractQualifiers(text);
  const out: ClassifiedResource[] = [];

  const push = (type: CanonicalResourceType) => {
    out.push({
      type,
      field,
      index,
      text,
      qualifiers,
      headResource: headResourceLabel(text, type),
    });
  };

  if (/\bmana\b/.test(t) && (/per reanimation|plus red mana|at least five mana/.test(t) || /five mana per reanimation/.test(t))) {
    push("REANIMATION_MANA_COST");
    return out;
  }
  if (/\bmana\b/.test(t) && (/appropriate to replay|replay recovered/.test(t))) {
    push("RECURSION_MANA_COST");
    return out;
  }
  if (/unbounded mana|large or unbounded mana/.test(t)) {
    push("UNBOUNDED_MANA");
    return out;
  }
  if (/repeatable nonland mana|flexible mana availability|efficient early mana|^open mana$|open protective mana|additional commander-amplified mana/.test(t)) {
    push("BOUNDED_MANA");
    return out;
  }
  if (/repeatable nonland mana permanent|nonland mana base|developed nonland mana base|nonland permanent slots/.test(t)) {
    push("NONLAND_MANA_PERMANENT");
    return out;
  }
  if (/scalable mana outlet|functioning scalable outlet|scalable outlet/.test(t)) {
    push("SCALABLE_MANA_OUTLET");
    return out;
  }
  if (/recovered creature card in hand or on the battlefield|recovered creatures in accessible zones|recovered creature/.test(t)) {
    push("RECOVERED_CREATURE");
    return out;
  }
  if (/creature cards in the graveyard|legal creature target in the graveyard|graveyard targets as legal/.test(t)) {
    push("CREATURE_CARD_GRAVEYARD");
    return out;
  }
  if (/prepared reanimation targets|reanimation targets/.test(t)) {
    push("REANIMATION_TARGET");
    return out;
  }
  if (/castable enchantment spells|low-cost enchantment access|later enchantment spells|sustained access to later enchantment spells/.test(t)) {
    push("ENCHANTMENT_SPELL_ACCESS");
    return out;
  }
  if (/repeated enchantment cast events|enchantment cast events/.test(t)) {
    push("ENCHANTMENT_CAST_EVENT");
    return out;
  }
  if (/spirit enchantment creature tokens|scaled spirit enchantment creature tokens|enchantment creature tokens/.test(t)) {
    push("ENCHANTMENT_TOKEN");
    return out;
  }
  if (/scaled spirit tokens|^spirit tokens$/.test(t)) {
    push("SPIRIT_TOKEN");
    return out;
  }
  if (/power-4-plus attacking bodies|power-4-plus battlefield presence|threshold-compatible target|multiple power-4-plus creatures/.test(t)) {
    push("POWER_FOUR_PLUS_ATTACKER");
    return out;
  }
  if (/qualifying attackers|qualifying attacker|qualifying future attackers/.test(t)) {
    push("QUALIFYING_ATTACKER");
    return out;
  }
  if (/creature tokens|creature-token creation|^creature token$/.test(t) && !qualifiers.powerQualified) {
    push("CREATURE_TOKEN");
    return out;
  }
  if (/combat-access|successful attacks|legal attacks|combat step with legal attacks/.test(t)) {
    push("COMBAT_ACCESS");
    return out;
  }
  if (/top-card access|topdeck access|topdeck conversion|top of the library|repeated top-five access/.test(t)) {
    push("TOPDECK_ACCESS");
    return out;
  }
  if (/topdeck-recursion activations|topdeck conversion capacity|topdeck-only recursion/.test(t)) {
    push("TOPDECK_RECURSION");
    return out;
  }
  if (/experience counters/.test(t)) {
    push("EXPERIENCE_COUNTER");
    return out;
  }
  if (/creature-recovery effects|recursion activation window|recovered creatures/.test(t) && qualifiers.zone !== "GRAVEYARD") {
    push("RECURSION_TARGET");
    return out;
  }
  if (/untap steps|reusable reset mechanism|untap-enabled/.test(t)) {
    push("UNTAP_RESET");
    return out;
  }
  if (/protective interaction|protection and removal|protection or interaction|protective mana/.test(t)) {
    push("PROTECTION_INTERACTION");
    return out;
  }
  if (/cards or selection|card selection|creature-search or selection/.test(t)) {
    push("CARD_SELECTION");
    return out;
  }
  if (/replacement cards|sustained card flow|card-equivalent selection|card velocity/.test(t)) {
    push("CARD_ADVANTAGE");
    return out;
  }
  if (/combat damage pressure|combat-damage conversion/.test(t)) {
    push("COMBAT_DAMAGE");
    return out;
  }

  return out;
}

/** Strict exact-or-subtype compatibility without dropping qualifiers. */
const EXACT_COMPAT: Partial<Record<CanonicalResourceType, CanonicalResourceType[]>> = {
  QUALIFYING_ATTACKER: ["QUALIFYING_ATTACKER", "COMBAT_ACCESS"],
  COMBAT_ACCESS: ["COMBAT_ACCESS", "QUALIFYING_ATTACKER"],
  TOPDECK_ACCESS: ["TOPDECK_ACCESS", "TOPDECK_RECURSION"],
  TOPDECK_RECURSION: ["TOPDECK_RECURSION", "TOPDECK_ACCESS"],
  ENCHANTMENT_TOKEN: ["ENCHANTMENT_TOKEN", "SPIRIT_TOKEN"],
  SPIRIT_TOKEN: ["SPIRIT_TOKEN", "ENCHANTMENT_TOKEN"],
};

export function producerSatisfiesRequirement(
  produced: ClassifiedResource,
  required: ClassifiedResource,
): boolean {
  if (produced.field !== "producedResources") return false;

  const exactOk =
    produced.type === required.type ||
    (EXACT_COMPAT[produced.type]?.includes(required.type) ?? false);
  if (!exactOk) return false;

  if (MANA_TYPES.has(required.type) && !MANA_TYPES.has(produced.type)) return false;
  if (MANA_TYPES.has(produced.type) && !MANA_TYPES.has(required.type)) return false;

  if (required.type === "UNBOUNDED_MANA") {
    if (produced.type !== "UNBOUNDED_MANA" || produced.qualifiers.potency !== "UNBOUNDED") return false;
  }
  if (required.type === "BOUNDED_MANA" && produced.type === "BOUNDED_MANA") {
    if (required.qualifiers.potency === "UNBOUNDED") return false;
  }

  if (required.type === "CREATURE_CARD_GRAVEYARD") {
    if (produced.type !== "CREATURE_CARD_GRAVEYARD") return false;
    if (produced.qualifiers.zone !== "GRAVEYARD" || required.qualifiers.zone !== "GRAVEYARD") return false;
  }

  if (required.type === "REANIMATION_TARGET" && produced.type === "REANIMATION_TARGET") {
    if (required.qualifiers.objectKind === "MANA" || produced.qualifiers.objectKind === "MANA") return false;
  }

  if (required.type === "POWER_FOUR_PLUS_ATTACKER" && !produced.qualifiers.powerQualified) return false;

  if (required.qualifiers.zone === "GRAVEYARD" && produced.qualifiers.zone !== "GRAVEYARD") return false;
  if (produced.type === "RECOVERED_CREATURE" && required.type === "CREATURE_CARD_GRAVEYARD") return false;

  if (required.type === "REANIMATION_MANA_COST" || required.type === "RECURSION_MANA_COST") {
    return false;
  }

  return true;
}

export function classifyPackageResources(pkg: SemanticPackage): ClassifiedResource[] {
  const out: ClassifiedResource[] = [];
  const fields: Array<{ field: ClassifiedResource["field"]; lines: string[] }> = [
    { field: "requiredResources", lines: pkg.requiredResources },
    { field: "producedResources", lines: pkg.producedResources },
    { field: "payoffs", lines: pkg.payoffs },
    { field: "semanticRequirements", lines: pkg.semanticRequirements.map((s) => s.requirement) },
  ];

  for (const { field, lines } of fields) {
    lines.forEach((text, index) => {
      out.push(...classifyLine(text, field, index));
    });
  }
  return out;
}

export function primaryEngineCluster(types: CanonicalResourceType[]): string {
  if (types.length === 0) return "GENERAL";
  const priority: CanonicalResourceType[] = [
    "UNBOUNDED_MANA",
    "GRAVEYARD_SETUP",
    "TOPDECK_RECURSION",
    "ENCHANTMENT_SPELL_ACCESS",
    "SACRIFICE_OUTLET",
    "CREATURE_TOKEN",
    "COMBAT_DAMAGE",
    "EXPERIENCE_COUNTER",
    "CARD_SELECTION",
  ];
  for (const p of priority) {
    if (types.includes(p)) return p;
  }
  return types[0];
}

export function packageEngineCluster(pkg: SemanticPackage): string {
  const classified = classifyPackageResources(pkg);
  const produced = classified.filter((c) => c.field === "producedResources").map((c) => c.type);
  return primaryEngineCluster(produced);
}

export function isManaResourceType(type: CanonicalResourceType): boolean {
  return MANA_TYPES.has(type);
}
