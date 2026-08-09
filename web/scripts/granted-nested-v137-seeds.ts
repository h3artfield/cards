export type NestedGrantSeed = {
  id: string;
  cardName: string;
  category: string;
  grammarFamily:
    | "equipment_has"
    | "enchanted_has"
    | "creatures_gain"
    | "creatures_have"
    | "target_gains"
    | "token_has";
  recipientPattern: RegExp;
  grantKind: "activated" | "triggered" | "static";
  layer2Gold?: Array<{ actionType: string; evidenceContains: string }>;
  certifiedEmptyLayer2?: boolean;
  costEvidence?: string;
};

/** Catalog-backed nested-grant development seeds — parser-blind layer-2 adjudication. */
export const NESTED_GRANT_V137_SEEDS: NestedGrantSeed[] = [
  {
    id: "granted-nested-v137-001",
    cardName: "Ephara's Radiance",
    category: "nested-grant-activated-gain-life",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "activated",
    costEvidence: "{1}{W}, {T}",
    layer2Gold: [{ actionType: "gain_life", evidenceContains: "You gain 3 life" }],
  },
  {
    id: "granted-nested-v137-002",
    cardName: "Hypervolt Grasp",
    category: "nested-grant-activated-damage",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "activated",
    costEvidence: "{T}",
    layer2Gold: [{ actionType: "deal_damage", evidenceContains: "deals 1 damage" }],
  },
  {
    id: "granted-nested-v137-003",
    cardName: "Cryptolith Rite",
    category: "nested-grant-creatures-have-mana",
    grammarFamily: "creatures_have",
    recipientPattern: /\bCreatures you control\b/i,
    grantKind: "activated",
    costEvidence: "{T}",
    layer2Gold: [{ actionType: "add_mana", evidenceContains: "Add one mana of any color" }],
  },
  {
    id: "granted-nested-v137-004",
    cardName: "Immobilizing Ink",
    category: "nested-grant-activated-discard-untap",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "activated",
    costEvidence: "{1}, Discard a card",
    layer2Gold: [{ actionType: "untap", evidenceContains: "Untap this creature" }],
  },
  {
    id: "granted-nested-v137-005",
    cardName: "Sixth Sense",
    category: "nested-grant-triggered-draw",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "triggered",
    layer2Gold: [{ actionType: "draw", evidenceContains: "you may draw a card" }],
  },
  {
    id: "granted-nested-v137-006",
    cardName: "Ghostly Touch",
    category: "nested-grant-triggered-tap",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "triggered",
    layer2Gold: [{ actionType: "tap", evidenceContains: "tap or untap target permanent" }],
  },
  {
    id: "granted-nested-v137-007",
    cardName: "Sorcerer's Wand",
    category: "nested-grant-activated-damage",
    grammarFamily: "equipment_has",
    recipientPattern: /\bEquipped creature\b/i,
    grantKind: "activated",
    costEvidence: "{T}",
    layer2Gold: [{ actionType: "deal_damage", evidenceContains: "deals 1 damage" }],
  },
  {
    id: "granted-nested-v137-008",
    cardName: "Sadistic Obsession",
    category: "nested-grant-activated-counter",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "activated",
    costEvidence: "{B}, {T}",
    layer2Gold: [{ actionType: "put_counter", evidenceContains: "Put a -1/-1 counter" }],
  },
  {
    id: "granted-nested-v137-009",
    cardName: "Alpha Authority",
    category: "nested-grant-static-only",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "static",
    certifiedEmptyLayer2: true,
  },
  {
    id: "granted-nested-v137-010",
    cardName: "Fire Whip",
    category: "nested-grant-activated-sacrifice-damage",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "activated",
    costEvidence: "{T}",
    layer2Gold: [{ actionType: "deal_damage", evidenceContains: "deals 1 damage" }],
  },
];
