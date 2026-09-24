/**
 * Canonical typed resource ontology for package synergy graph v3.
 * All graph edges must cite these types — never arbitrary prose tokens.
 */
import type { SemanticPackage } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";

export const CANONICAL_RESOURCE_ONTOLOGY_V1_VERSION = "phase6a1-canonical-resource-ontology-v1";

export type CanonicalResourceType =
  | "UNBOUNDED_MANA"
  | "BOUNDED_MANA"
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

export type ClassifiedResource = {
  type: CanonicalResourceType;
  field: "requiredResources" | "producedResources" | "payoffs" | "semanticRequirements";
  index: number;
  text: string;
};

type ClassifierRule = {
  type: CanonicalResourceType;
  patterns: RegExp[];
  fields: ClassifiedResource["field"][];
};

const CLASSIFIERS: ClassifierRule[] = [
  {
    type: "UNBOUNDED_MANA",
    patterns: [/unbounded mana/i, /large or unbounded mana/i],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "BOUNDED_MANA",
    patterns: [/repeatable nonland mana/i, /flexible mana availability/i, /efficient early mana/i, /open mana/i, /open protective mana/i],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "NONLAND_MANA_PERMANENT",
    patterns: [/repeatable nonland mana permanent/i, /nonland mana base/i, /developed nonland mana base/i, /nonland permanent slots/i],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "UNTAP_RESET",
    patterns: [/untap steps/i, /reusable reset mechanism/i, /untap effects/i, /untap-enabled/i],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "SCALABLE_MANA_OUTLET",
    patterns: [/scalable mana outlet/i, /scalable outlet/i, /functioning scalable outlet/i, /scalable mana outlets/i],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "ENCHANTMENT_SPELL_ACCESS",
    patterns: [
      /castable enchantment spells/i,
      /low-cost enchantment access/i,
      /later enchantment spells/i,
      /sustained access to later enchantment spells/i,
      /enchantment spells/i,
    ],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "ENCHANTMENT_CAST_EVENT",
    patterns: [/repeated enchantment cast events/i, /enchantment cast events/i],
    fields: ["producedResources", "payoffs"],
  },
  {
    type: "ENCHANTMENT_PERMANENT",
    patterns: [/persistent battlefield value/i, /enchantment role/i],
    fields: ["producedResources"],
  },
  {
    type: "ENCHANTMENT_TOKEN",
    patterns: [/enchantment creature tokens/i, /spirit enchantment creature tokens/i, /scaled spirit enchantment creature tokens/i],
    fields: ["producedResources", "requiredResources"],
  },
  {
    type: "SPIRIT_TOKEN",
    patterns: [/scaled spirit tokens/i, /spirit tokens/i],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "CREATURE_TOKEN",
    patterns: [/creature tokens/i, /creature-token creation/i, /creature token/i],
    fields: ["requiredResources", "producedResources", "payoffs"],
  },
  {
    type: "CREATURE_DEPLOYMENT",
    patterns: [/creature deployment/i, /deployed creatures/i, /battlefield deployment/i, /repeated creature deployment/i],
    fields: ["producedResources", "payoffs"],
  },
  {
    type: "CREATURE_CARD_GRAVEYARD",
    patterns: [/creature cards in the graveyard/i, /legal creature target in the graveyard/i, /graveyard targets/i],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "TOPDECK_ACCESS",
    patterns: [/top-card access/i, /topdeck access/i, /topdeck-recursion/i, /topdeck conversion/i, /top of the library/i, /repeated top-five access/i],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "TOPDECK_RECURSION",
    patterns: [/topdeck-recursion activations/i, /topdeck conversion capacity/i, /topdeck-only recursion/i],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "GRAVEYARD_SETUP",
    patterns: [/selective graveyard setup/i, /self-mill/i, /zone movement/i],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "RECURSION_TARGET",
    patterns: [/creature-recovery effects/i, /recovered creatures/i, /recursion activation/i],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "SACRIFICE_OUTLET",
    patterns: [/sacrifice outlets/i, /sacrifice outlet/i, /sacrifice-mediated/i],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "SACRIFICE_PAYOFF",
    patterns: [/sacrifice payoff/i, /death payoffs/i, /sacrifice value/i],
    fields: ["producedResources", "payoffs"],
  },
  {
    type: "POWER_FOUR_PLUS_ATTACKER",
    patterns: [/power-4-plus/i, /power 4/i, /threshold-compatible target/i],
    fields: ["requiredResources", "producedResources", "payoffs"],
  },
  {
    type: "QUALIFYING_ATTACKER",
    patterns: [/qualifying attackers/i, /qualifying attacker/i, /qualifying future attackers/i],
    fields: ["requiredResources", "producedResources", "payoffs"],
  },
  {
    type: "COMBAT_ACCESS",
    patterns: [/combat-access/i, /successful attacks/i, /legal attacks/i, /combat step/i],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "COMBAT_DAMAGE",
    patterns: [/combat damage/i, /combat-damage conversion/i, /combat damage pressure/i],
    fields: ["producedResources", "payoffs"],
  },
  {
    type: "EXPERIENCE_COUNTER",
    patterns: [/experience counters/i],
    fields: ["requiredResources", "producedResources", "payoffs"],
  },
  {
    type: "CARD_SELECTION",
    patterns: [/cards or selection/i, /card selection/i, /creature-search or selection/i, /selection effects/i, /draw quality through selection/i],
    fields: ["requiredResources", "producedResources", "payoffs"],
  },
  {
    type: "CARD_ADVANTAGE",
    patterns: [/replacement cards/i, /sustained card flow/i, /card-equivalent selection/i, /card velocity/i],
    fields: ["producedResources", "payoffs"],
  },
  {
    type: "TOKEN_AMPLIFIER",
    patterns: [/token amplifier/i, /token-entry payoff/i],
    fields: ["requiredResources"],
  },
  {
    type: "PROTECTION_INTERACTION",
    patterns: [/protective interaction/i, /protection and removal/i, /protection or interaction/i, /protective mana/i],
    fields: ["requiredResources", "producedResources"],
  },
  {
    type: "REANIMATION_TARGET",
    patterns: [/reanimation/i, /reanimate/i, /recovered creature/i],
    fields: ["requiredResources", "producedResources"],
  },
];

/** Producer type T satisfies consumer requirement type U. */
const TYPE_SATISFIES: Partial<Record<CanonicalResourceType, CanonicalResourceType[]>> = {
  UNBOUNDED_MANA: ["UNBOUNDED_MANA"],
  BOUNDED_MANA: ["BOUNDED_MANA", "UNBOUNDED_MANA"],
  NONLAND_MANA_PERMANENT: ["NONLAND_MANA_PERMANENT"],
  UNTAP_RESET: ["UNTAP_RESET"],
  SCALABLE_MANA_OUTLET: ["SCALABLE_MANA_OUTLET"],
  ENCHANTMENT_SPELL_ACCESS: ["ENCHANTMENT_SPELL_ACCESS"],
  ENCHANTMENT_CAST_EVENT: ["ENCHANTMENT_CAST_EVENT", "ENCHANTMENT_SPELL_ACCESS"],
  ENCHANTMENT_PERMANENT: ["ENCHANTMENT_PERMANENT"],
  ENCHANTMENT_TOKEN: ["ENCHANTMENT_TOKEN", "SPIRIT_TOKEN"],
  SPIRIT_TOKEN: ["SPIRIT_TOKEN", "ENCHANTMENT_TOKEN"],
  CREATURE_TOKEN: ["CREATURE_TOKEN", "QUALIFYING_ATTACKER", "POWER_FOUR_PLUS_ATTACKER"],
  CREATURE_DEPLOYMENT: ["CREATURE_DEPLOYMENT", "QUALIFYING_ATTACKER"],
  CREATURE_CARD_GRAVEYARD: ["CREATURE_CARD_GRAVEYARD", "RECURSION_TARGET"],
  TOPDECK_ACCESS: ["TOPDECK_ACCESS", "TOPDECK_RECURSION"],
  TOPDECK_RECURSION: ["TOPDECK_RECURSION", "TOPDECK_ACCESS"],
  GRAVEYARD_SETUP: ["GRAVEYARD_SETUP", "CREATURE_CARD_GRAVEYARD"],
  RECURSION_TARGET: ["RECURSION_TARGET", "CREATURE_CARD_GRAVEYARD"],
  SACRIFICE_OUTLET: ["SACRIFICE_OUTLET"],
  SACRIFICE_PAYOFF: ["SACRIFICE_PAYOFF"],
  POWER_FOUR_PLUS_ATTACKER: ["POWER_FOUR_PLUS_ATTACKER", "QUALIFYING_ATTACKER"],
  QUALIFYING_ATTACKER: ["QUALIFYING_ATTACKER", "COMBAT_ACCESS"],
  COMBAT_ACCESS: ["COMBAT_ACCESS", "QUALIFYING_ATTACKER"],
  COMBAT_DAMAGE: ["COMBAT_DAMAGE"],
  EXPERIENCE_COUNTER: ["EXPERIENCE_COUNTER"],
  CARD_SELECTION: ["CARD_SELECTION", "CARD_ADVANTAGE"],
  CARD_ADVANTAGE: ["CARD_ADVANTAGE", "CARD_SELECTION"],
  TOKEN_AMPLIFIER: ["TOKEN_AMPLIFIER"],
  PROTECTION_INTERACTION: ["PROTECTION_INTERACTION"],
  REANIMATION_TARGET: ["REANIMATION_TARGET", "CREATURE_CARD_GRAVEYARD"],
};

export function producerSatisfiesRequirement(
  produced: CanonicalResourceType,
  required: CanonicalResourceType,
): boolean {
  if (produced === required) return true;
  return TYPE_SATISFIES[produced]?.includes(required) ?? false;
}

export function classifyPackageResources(pkg: SemanticPackage): ClassifiedResource[] {
  const out: ClassifiedResource[] = [];
  const seen = new Set<string>();

  const fields: Array<{ field: ClassifiedResource["field"]; lines: string[] }> = [
    { field: "requiredResources", lines: pkg.requiredResources },
    { field: "producedResources", lines: pkg.producedResources },
    { field: "payoffs", lines: pkg.payoffs },
    { field: "semanticRequirements", lines: pkg.semanticRequirements.map((s) => s.requirement) },
  ];

  for (const { field, lines } of fields) {
    lines.forEach((text, index) => {
      for (const rule of CLASSIFIERS) {
        if (!rule.fields.includes(field)) continue;
        if (!rule.patterns.some((p) => p.test(text))) continue;
        const key = `${field}:${index}:${rule.type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ type: rule.type, field, index, text });
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
  const produced = classified.filter((c) => c.field === "producedResources" || c.field === "payoffs").map((c) => c.type);
  return primaryEngineCluster(produced);
}
