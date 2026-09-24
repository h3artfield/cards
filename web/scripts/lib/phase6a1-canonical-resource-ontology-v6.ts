/**
 * Canonical typed resource ontology v6 — v5 destination fail-closed preserved; atomic conjuncts + cardinality.
 */
import type { SemanticPackage } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";

export const CANONICAL_RESOURCE_ONTOLOGY_V6_VERSION = "phase6a1-canonical-resource-ontology-v6";

export type ResourceCardinality = "ONE" | "MULTIPLE" | "UNSPECIFIED";
export type LogicalRequirementAtom =
  | "MANA_DEVELOPMENT"
  | "INTERACTION_ACCESS"
  | "GENERAL";

export type SemanticRole =
  | "RESOURCE_QUANTITY"
  | "SOURCE_OBJECT"
  | "TARGET_OBJECT"
  | "OUTLET"
  | "ACCESS_METHOD"
  | "ACTION_METHOD"
  | "ENABLER"
  | "TIMING_WINDOW"
  | "DESTINATION"
  | "MANA_OUTPUT"
  | "OUTCOME"
  | "CARD_FLOW_EFFECT"
  | "DECK_SLOT"
  | "PAYMENT_RESOURCE"
  | "PROTECTION_EFFECT"
  | "TARGETING_EFFECT";

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
  cardinality: ResourceCardinality;
  objectKind: "MANA" | "CREATURE_CARD" | "CREATURE_TOKEN" | "SPELL" | "TARGET" | "ACCESS" | "OTHER";
};

export type ClassifiedResource = {
  type: CanonicalResourceType;
  field: "requiredResources" | "producedResources" | "payoffs" | "semanticRequirements";
  index: number;
  text: string;
  qualifiers: ResourceQualifiers;
  headResource: string;
  role: SemanticRole;
  causalEligible: boolean;
  compoundRequirementText?: string;
  logicalAtom?: LogicalRequirementAtom;
  conjunctIndex?: number;
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

function extractCardinality(text: string): ResourceCardinality {
  const t = normalize(text);
  if (
    /^multiple |^several |multiple power|multiple creature|multiple scaled|multiple recovered|multiple spirit|enough useful|high density|board of |multi-attacker|attacking bodies|creature tokens$|spirit tokens$/.test(
      t,
    )
  ) {
    return "MULTIPLE";
  }
  if (/^a |^an |^one |when a |when an |threshold-compatible target is chosen/.test(t)) {
    return "ONE";
  }
  return "UNSPECIFIED";
}

function inferLogicalAtom(text: string): LogicalRequirementAtom {
  const t = normalize(text);
  if (/\binteraction\b/.test(t) && !/\bmana development and interaction\b/.test(t)) return "INTERACTION_ACCESS";
  if (/mana development|recovered mana|mana infrastructure|open protective mana|repeatable nonland mana/.test(t)) {
    return "MANA_DEVELOPMENT";
  }
  return "GENERAL";
}

function splitConjunctiveRequirement(text: string): [string, string] | null {
  const match = text.match(/^(.+?)\s+and\s+(.+)$/i);
  if (!match) return null;
  const left = match[1]!.trim();
  const right = match[2]!.trim();
  if (!left || !right) return null;
  if (/ or | with meaningful| that also | before or after| especially | capable of absorbing/i.test(text)) return null;
  const leftNorm = left.toLowerCase();
  const rightNorm = right.toLowerCase();
  if (leftNorm.includes("development") && rightNorm.includes("interaction")) {
    return [left, right];
  }
  return null;
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

  return { zone, potency, powerQualified, cardinality: extractCardinality(text), objectKind };
}

function headResourceLabel(text: string, type: CanonicalResourceType): string {
  return `${type}:${normalize(text).slice(0, 80)}`;
}

function classifyLine(text: string, field: ClassifiedResource["field"], index: number): ClassifiedResource[] {
  const t = normalize(text);
  const qualifiers = extractQualifiers(text);
  const out: ClassifiedResource[] = [];

  const push = (type: CanonicalResourceType, role: SemanticRole, causalEligible = field === "requiredResources" || field === "producedResources") => {
    out.push({
      type,
      field,
      index,
      text,
      qualifiers,
      headResource: headResourceLabel(text, type),
      role,
      causalEligible,
    });
  };

  if (/reduced tempo loss|reduced vulnerability|improved mana efficiency|defensive optionality/.test(t)) {
    return out;
  }

  if (/elf mana producers|elves with activated abilities that tap to produce mana|mana-producing elves on the battlefield/.test(t)) {
    push("NONLAND_MANA_PERMANENT", "SOURCE_OBJECT");
    return out;
  }
  if (/tap-based elf card-flow|elf card-flow ability|a tap-based elf card-flow ability/.test(t)) {
    push("CARD_ADVANTAGE", "CARD_FLOW_EFFECT");
    return out;
  }
  if (/low-cost elf creatures|castable elf creatures|low-cost elf development/.test(t)) {
    push("CREATURE_DEPLOYMENT", "SOURCE_OBJECT");
    return out;
  }
  if (/^nonland permanent slots$|nonland permanent slots for|early deck slots for nonland/.test(t)) {
    push("NONLAND_MANA_PERMANENT", "DECK_SLOT");
    return out;
  }
  if (
    /creature card placed on top of the library|card placed on top of the library|multiple recovered creatures ordered|recovered creatures ordered on top/.test(
      t,
    )
  ) {
    push("RECOVERED_CREATURE", "TARGET_OBJECT");
    out[out.length - 1]!.qualifiers.zone = "LIBRARY";
    return out;
  }
  if (/recovered creature card in hand or on the battlefield|recovered creatures in accessible zones/.test(t)) {
    push("RECOVERED_CREATURE", "TARGET_OBJECT");
    out[out.length - 1]!.qualifiers.zone = "GENERAL";
    return out;
  }
  if (/mana held for protection|mana held for interaction|untapped mana for interaction|development must leave enough untapped mana/.test(t)) {
    push("BOUNDED_MANA", "PAYMENT_RESOURCE");
    return out;
  }
  if (
    /^interaction$|^enough.*interaction|,\s*interaction$/.test(t) ||
    (field === "requiredResources" && /\binteraction\b/.test(t) && !/\bmana\b/.test(t) && !/protection or interaction for/.test(t))
  ) {
    push("PROTECTION_INTERACTION", "PROTECTION_EFFECT");
    return out;
  }
  if (/protection or interaction for the attack|protection or interaction must preserve|protection and removal slots/.test(t)) {
    push("PROTECTION_INTERACTION", "PROTECTION_EFFECT");
    return out;
  }
  if (/qualifying self-targeting spell|compatible self-targeting effect|self-targeting spell|self-targeting effect/.test(t)) {
    push("ENCHANTMENT_SPELL_ACCESS", "TARGETING_EFFECT");
    return out;
  }
  if (/immediate access to scalable outlets|access to scalable outlets/.test(t)) {
    push("SCALABLE_MANA_OUTLET", "ACCESS_METHOD");
    return out;
  }
  if (/flexible ways to turn increased hand size|turn increased hand size or card selection into board/.test(t)) {
    push("CREATURE_DEPLOYMENT", "OUTLET");
    return out;
  }
  if (/elves with repeatable activated tap abilities|elf.*tap abilities that generate cards or meaningful card selection/.test(t)) {
    push("CARD_SELECTION", "SOURCE_OBJECT");
    return out;
  }
  if (/creature-recovery effects that do not require|recovery effects that do not require the command/.test(t)) {
    push("RECURSION_TARGET", "ACTION_METHOD");
    return out;
  }
  if (/mana development sufficient to activate|creature-based mana development that advances/.test(t)) {
    push("RECURSION_MANA_COST", "MANA_OUTPUT");
    return out;
  }

  if (/\bmana\b/.test(t) && (/per reanimation|plus red mana|at least five mana/.test(t) || /five mana per reanimation/.test(t))) {
    push("REANIMATION_MANA_COST", "MANA_OUTPUT");
    return out;
  }
  if (/\bmana\b/.test(t) && /appropriate to replay|replay recovered/.test(t)) {
    push("RECURSION_MANA_COST", "MANA_OUTPUT");
    return out;
  }
  if (/unbounded mana|large or unbounded mana/.test(t)) {
    push("UNBOUNDED_MANA", "MANA_OUTPUT");
    return out;
  }
  if (/repeatable nonland mana permanent|nonland mana permanent|a repeatable nonland mana permanent/.test(t)) {
    push("NONLAND_MANA_PERMANENT", "SOURCE_OBJECT");
    return out;
  }
  if (/repeatable nonland mana|flexible mana availability|efficient early mana|^open mana$|open protective mana|additional commander-amplified mana|mana development/.test(t)) {
    push("BOUNDED_MANA", "MANA_OUTPUT");
    return out;
  }
  if (/repeatable nonland mana base|developed nonland mana base|a developed nonland mana base/.test(t)) {
    push("NONLAND_MANA_PERMANENT", "SOURCE_OBJECT");
    return out;
  }
  if (/scalable mana outlet|functioning scalable outlet|scalable outlet|noncommander scalable outlet|prefer an outlet that can be used as soon as large or unbounded/.test(t)) {
    push("SCALABLE_MANA_OUTLET", "OUTLET");
    return out;
  }
  if (/creature cards in the graveyard|legal creature target in the graveyard|graveyard targets as legal/.test(t)) {
    push("CREATURE_CARD_GRAVEYARD", "TARGET_OBJECT");
    return out;
  }
  if (/prepared reanimation targets|reanimation targets/.test(t)) {
    push("REANIMATION_TARGET", "TARGET_OBJECT");
    return out;
  }
  if (/castable enchantment spells|low-cost enchantment access|later enchantment spells|sustained access to later enchantment spells/.test(t)) {
    push("ENCHANTMENT_SPELL_ACCESS", "ACCESS_METHOD");
    return out;
  }
  if (/repeated enchantment cast events|enchantment cast events/.test(t)) {
    push("ENCHANTMENT_CAST_EVENT", "OUTCOME", false);
    return out;
  }
  if (/spirit enchantment creature tokens|scaled spirit enchantment creature tokens|enchantment creature tokens/.test(t)) {
    push("ENCHANTMENT_TOKEN", "TARGET_OBJECT");
    return out;
  }
  if (/scaled spirit tokens|^spirit tokens$/.test(t)) {
    push("SPIRIT_TOKEN", "TARGET_OBJECT");
    return out;
  }
  if (/power-4-plus attacking bodies|power-4-plus battlefield presence|threshold-compatible target|multiple power-4-plus creatures/.test(t)) {
    push("POWER_FOUR_PLUS_ATTACKER", "TARGET_OBJECT");
    return out;
  }
  if (/qualifying attackers|qualifying attacker|qualifying future attackers/.test(t)) {
    push("QUALIFYING_ATTACKER", "TARGET_OBJECT");
    return out;
  }
  if (/method for sacrificing|sacrifice outlet|sacrificing creature tokens|repeatable or low-cost method for sacrificing/.test(t)) {
    push("SACRIFICE_OUTLET", "ACTION_METHOD");
    return out;
  }
  if (/creature tokens|creature-token creation|^creature token$/.test(t) && !qualifiers.powerQualified) {
    push("CREATURE_TOKEN", "TARGET_OBJECT");
    return out;
  }
  if (/^successful attacks$|successful attacks from/.test(t)) {
    push("COMBAT_ACCESS", "OUTCOME");
    return out;
  }
  if (/combat step with legal attacks|an available combat step|a legal combat step|profitable combat opportunity|combat-access|combat step with legal attacks|legal attacks/.test(t)) {
    push("COMBAT_ACCESS", "ACCESS_METHOD");
    return out;
  }
  if (/top-card access|draw capacity|topdeck access|mana and top-card access|top-card access for redeployment/.test(t)) {
    push("TOPDECK_ACCESS", "ACCESS_METHOD");
    return out;
  }
  if (/additional topdeck-recursion activations|topdeck-recursion activations/.test(t)) {
    push("TOPDECK_RECURSION", "ACTION_METHOD");
    return out;
  }
  if (/topdeck conversion capacity|topdeck-only recursion/.test(t)) {
    push("TOPDECK_RECURSION", "ENABLER");
    return out;
  }
  if (/mix of recovery destinations|especially hand or battlefield/.test(t)) {
    push("RECOVERED_CREATURE", "DESTINATION");
    return out;
  }
  if (/reliable recursion activation window|activation window/.test(t)) {
    push("RECURSION_TARGET", "TIMING_WINDOW");
    return out;
  }
  if (/independent creature-recovery effects|creature-recovery effects/.test(t)) {
    push("RECURSION_TARGET", "ACTION_METHOD");
    return out;
  }
  if (/experience counters/.test(t)) {
    push("EXPERIENCE_COUNTER", "RESOURCE_QUANTITY");
    return out;
  }
  if (/untap steps|reusable reset mechanism|untap-enabled/.test(t)) {
    push("UNTAP_RESET", "ENABLER");
    return out;
  }
  if (/protective interaction|protective mana/.test(t) && !/mana held/.test(t)) {
    push("PROTECTION_INTERACTION", "ENABLER");
    return out;
  }
  if (/hand-to-board|conversion outlet|noncreature card selection|inexpensive noncreature/.test(t)) {
    push("CARD_SELECTION", field === "semanticRequirements" ? "SOURCE_OBJECT" : "OUTCOME", false);
    return out;
  }
  if (/^cards or selection$|^card selection$|creature-search or selection|cards or card selection/.test(t)) {
    push("CARD_SELECTION", field === "producedResources" ? "OUTCOME" : "ACCESS_METHOD", field !== "semanticRequirements");
    return out;
  }
  if (/replacement cards|sustained card flow|card-equivalent selection|card velocity/.test(t)) {
    push("CARD_ADVANTAGE", "OUTCOME", false);
    return out;
  }
  if (/combat damage pressure|combat-damage conversion/.test(t)) {
    push("COMBAT_DAMAGE", "OUTCOME", false);
    return out;
  }

  return out;
}

/** Strict exact type match only — no cross-type coercion. */
const EXACT_COMPAT: Partial<Record<CanonicalResourceType, CanonicalResourceType[]>> = {
  ENCHANTMENT_TOKEN: ["ENCHANTMENT_TOKEN", "SPIRIT_TOKEN"],
  SPIRIT_TOKEN: ["SPIRIT_TOKEN", "ENCHANTMENT_TOKEN"],
};

function rolesCompatible(produced: ClassifiedResource, required: ClassifiedResource): boolean {
  if (produced.role !== required.role) return false;
  return true;
}

export function producerSatisfiesRequirement(
  produced: ClassifiedResource,
  required: ClassifiedResource,
): boolean {
  if (produced.field !== "producedResources") return false;
  if (required.field !== "requiredResources") return false;
  if (!produced.causalEligible || !required.causalEligible) return false;
  if (!rolesCompatible(produced, required)) return false;

  const exactOk =
    produced.type === required.type ||
    (EXACT_COMPAT[produced.type]?.includes(required.type) ?? false);
  if (!exactOk) return false;

  if (required.type === "UNBOUNDED_MANA") {
    if (produced.type !== "UNBOUNDED_MANA" || produced.qualifiers.potency !== "UNBOUNDED") return false;
  }
  if (required.type === "NONLAND_MANA_PERMANENT" && produced.type !== "NONLAND_MANA_PERMANENT") return false;
  if (produced.type === "BOUNDED_MANA" && required.type === "UNBOUNDED_MANA") return false;

  if (required.type === "CREATURE_CARD_GRAVEYARD") {
    if (produced.type !== "CREATURE_CARD_GRAVEYARD") return false;
    if (produced.qualifiers.zone !== "GRAVEYARD" || required.qualifiers.zone !== "GRAVEYARD") return false;
  }

  if (required.type === "RECOVERED_CREATURE" && required.qualifiers.zone === "LIBRARY") {
    if (produced.type !== "RECOVERED_CREATURE" || produced.qualifiers.zone !== "LIBRARY") return false;
    if (/accessible zones|hand or on the battlefield|mix of recovery destinations|especially hand or battlefield/i.test(produced.text)) {
      return false;
    }
  }

  if (required.type === "POWER_FOUR_PLUS_ATTACKER" && !produced.qualifiers.powerQualified) return false;
  if (produced.type === "CREATURE_TOKEN" && required.type === "POWER_FOUR_PLUS_ATTACKER") return false;

  if (required.qualifiers.cardinality === "MULTIPLE" && produced.qualifiers.cardinality === "ONE") return false;

  if (required.compoundRequirementText && required.logicalAtom) {
    const producerAtom = inferLogicalAtom(produced.text);
    if (required.logicalAtom === "INTERACTION_ACCESS" && producerAtom !== "INTERACTION_ACCESS") return false;
    if (required.logicalAtom === "MANA_DEVELOPMENT" && producerAtom !== "MANA_DEVELOPMENT") return false;
  }

  if (required.qualifiers.zone === "GRAVEYARD" && produced.qualifiers.zone !== "GRAVEYARD") return false;
  if (produced.type === "RECOVERED_CREATURE" && required.type === "CREATURE_CARD_GRAVEYARD") return false;
  if (produced.type === "RECOVERED_CREATURE" && required.role === "MANA_OUTPUT") return false;
  if (produced.type === "CREATURE_TOKEN" && required.type === "SACRIFICE_OUTLET") return false;
  if (produced.type === "TOPDECK_RECURSION" && required.type === "TOPDECK_ACCESS") return false;
  if (produced.type === "TOPDECK_RECURSION" && required.role === "DESTINATION") return false;
  if (produced.type === "COMBAT_ACCESS" && produced.role === "OUTCOME" && required.role === "ACCESS_METHOD") return false;
  if (produced.type === "CARD_SELECTION" && produced.role === "OUTCOME" && required.role === "SOURCE_OBJECT") return false;
  if (produced.type === "CARD_SELECTION" && produced.role !== "OUTCOME" && required.role === "OUTLET") return false;
  if (produced.role === "TIMING_WINDOW" && required.role === "ACTION_METHOD") return false;
  if (produced.type === "BOUNDED_MANA" && required.type === "NONLAND_MANA_PERMANENT") return false;

  if (required.type === "REANIMATION_MANA_COST" || required.type === "RECURSION_MANA_COST") {
    return false;
  }

  return true;
}

/** Symmetric shared-enabler: exact atomic head + role + type match only. */
export function requirementsShareEnabler(a: ClassifiedResource, b: ClassifiedResource): boolean {
  if (a.field !== "requiredResources" || b.field !== "requiredResources") return false;
  if (a.type !== b.type) return false;
  if (a.role !== b.role) return false;
  if (a.headResource !== b.headResource) return false;
  return true;
}

/** Symmetric shared-payoff: exact atomic head + role + type match only. */
export function payoffsShareMechanism(a: ClassifiedResource, b: ClassifiedResource): boolean {
  if (a.field !== "payoffs" || b.field !== "payoffs") return false;
  if (a.type !== b.type) return false;
  if (a.role !== b.role) return false;
  if (a.headResource !== b.headResource) return false;
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
      const conjuncts = field === "requiredResources" ? splitConjunctiveRequirement(text) : null;
      if (conjuncts) {
        conjuncts.forEach((atomText, conjunctIndex) => {
          const classified = classifyLine(atomText, field, index);
          out.push(
            ...classified.map((c) => ({
              ...c,
              compoundRequirementText: text,
              logicalAtom: inferLogicalAtom(atomText),
              conjunctIndex,
            })),
          );
        });
        return;
      }
      const classified = classifyLine(text, field, index);
      if (field === "semanticRequirements") {
        out.push(...classified.map((c) => ({ ...c, causalEligible: false })));
      } else {
        out.push(...classified);
      }
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
