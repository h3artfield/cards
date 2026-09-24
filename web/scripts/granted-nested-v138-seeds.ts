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
  layer2Gold?: Array<{ actionType: string; evidenceContains: string; optionalEffect?: boolean }>;
  certifiedEmptyLayer2?: boolean;
  costEvidence?: string;
};

/** Parser-unseen nested-grant transfer seeds — standard recipient patterns only. */
export const NESTED_GRANT_V138_SEEDS: NestedGrantSeed[] = [
  {
    id: "granted-nested-v138-001",
    cardName: "Paradise Mantle",
    category: "transfer-add-mana-any-color",
    grammarFamily: "equipment_has",
    recipientPattern: /\bEquipped creature\b/i,
    grantKind: "activated",
    costEvidence: "{T}",
    layer2Gold: [{ actionType: "add_mana", evidenceContains: "Add one mana of any color" }],
  },
  {
    id: "granted-nested-v138-002",
    cardName: "Enduring Vitality",
    category: "transfer-creatures-have-mana",
    grammarFamily: "creatures_have",
    recipientPattern: /\bCreatures you control\b/i,
    grantKind: "activated",
    costEvidence: "{T}",
    layer2Gold: [{ actionType: "add_mana", evidenceContains: "Add one mana of any color" }],
  },
  {
    id: "granted-nested-v138-003",
    cardName: "Citanul Hierophants",
    category: "transfer-add-mana-symbol",
    grammarFamily: "creatures_have",
    recipientPattern: /\bCreatures you control\b/i,
    grantKind: "activated",
    costEvidence: "{T}",
    layer2Gold: [{ actionType: "add_mana", evidenceContains: "Add {G}" }],
  },
  {
    id: "granted-nested-v138-004",
    cardName: "Galvanic Alchemist",
    category: "transfer-untap-this-creature",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "activated",
    costEvidence: "{2}{U}",
    layer2Gold: [{ actionType: "untap", evidenceContains: "Untap this creature" }],
  },
  {
    id: "granted-nested-v138-005",
    cardName: "Ringing Strike Mastery",
    category: "transfer-untap-this-creature-cost",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "activated",
    costEvidence: "{5}",
    layer2Gold: [{ actionType: "untap", evidenceContains: "Untap this creature" }],
  },
  {
    id: "granted-nested-v138-006",
    cardName: "Consuming Fervor",
    category: "transfer-put-minus-counter",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "triggered",
    layer2Gold: [{ actionType: "put_counter", evidenceContains: "put a -1/-1 counter" }],
  },
  {
    id: "granted-nested-v138-007",
    cardName: "Snake Umbra",
    category: "transfer-triggered-may-draw",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "triggered",
    layer2Gold: [{ actionType: "draw", evidenceContains: "draw a card", optionalEffect: true }],
  },
  {
    id: "granted-nested-v138-008",
    cardName: "Viridian Longbow",
    category: "transfer-activated-damage",
    grammarFamily: "equipment_has",
    recipientPattern: /\bEquipped creature\b/i,
    grantKind: "activated",
    costEvidence: "{T}",
    layer2Gold: [{ actionType: "deal_damage", evidenceContains: "deals 1 damage" }],
  },
  {
    id: "granted-nested-v138-009",
    cardName: "Bow of the Hunter",
    category: "transfer-activated-damage-two",
    grammarFamily: "equipment_has",
    recipientPattern: /\bEquipped creature\b/i,
    grantKind: "activated",
    costEvidence: "{T}",
    layer2Gold: [{ actionType: "deal_damage", evidenceContains: "deals 2 damage" }],
  },
  {
    id: "granted-nested-v138-010",
    cardName: "Sinking Feeling",
    category: "transfer-activated-untap-discard",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "activated",
    costEvidence: "{1}, Discard a card",
    layer2Gold: [{ actionType: "untap", evidenceContains: "Untap this creature" }],
  },
  {
    id: "granted-nested-v138-011",
    cardName: "Shardmage's Rescue",
    category: "transfer-static-certified-empty",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "static",
    certifiedEmptyLayer2: true,
  },
  {
    id: "granted-nested-v138-012",
    cardName: "Slippery Scoundrel",
    category: "transfer-static-certified-empty-2",
    grammarFamily: "enchanted_has",
    recipientPattern: /\bEnchanted creature\b/i,
    grantKind: "static",
    certifiedEmptyLayer2: true,
  },
];
