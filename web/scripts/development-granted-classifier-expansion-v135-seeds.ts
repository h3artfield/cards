/**
 * Catalog-backed granted-classifier development expansion (v1.35).
 * Unrelated Oracle IDs — not v13, blind, existing dev, or probe reserved.
 */
export type GrantedExpansionLabel = "positive_granted_region" | "negative_non_granted_region";

export type GrantedExpansionSeed = {
  cardName: string;
  label: GrantedExpansionLabel;
  category: string;
  selectionRule: string;
  /** Expected granted region count for positives; 0 for negatives */
  expectedGrantedRegionCount: number;
};

export const GRANTED_CLASSIFIER_EXPANSION_V135_SEEDS: GrantedExpansionSeed[] = [
  {
    cardName: "Swiftfoot Boots",
    label: "positive_granted_region",
    category: "equipment_has",
    selectionRule: "Equipped creature has haste",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Darksteel Plate",
    label: "positive_granted_region",
    category: "equipment_has",
    selectionRule: "Equipped creature has indestructible",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Fireshrieker",
    label: "positive_granted_region",
    category: "equipment_has",
    selectionRule: "Equipped creature has double strike",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Alpha Brawl",
    label: "positive_granted_region",
    category: "creatures_gain",
    selectionRule: "creatures you control gain trample and +1/+1 until end of turn",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Akroma's Will",
    label: "positive_granted_region",
    category: "creatures_gain",
    selectionRule: "creatures you control gain flying, vigilance, and double strike",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Archetype of Imagination",
    label: "positive_granted_region",
    category: "creatures_have",
    selectionRule: "Creatures you control have flying",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Conclave Mentor",
    label: "positive_granted_region",
    category: "creatures_have",
    selectionRule: "Creatures you control have lifelink",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Bant Charm",
    label: "positive_granted_region",
    category: "target_gains",
    selectionRule: "Target creature gains exalted until end of turn",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Kaya's Ghostform",
    label: "positive_granted_region",
    category: "enchanted_has",
    selectionRule: "Enchanted creature has",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Helm of the Host",
    label: "positive_granted_region",
    category: "token_with_ability",
    selectionRule: "token that's a copy with haste",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Rhys the Redeemed",
    label: "positive_granted_region",
    category: "token_has",
    selectionRule: "Each token you control has",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Lightning Greaves",
    label: "positive_granted_region",
    category: "equipment_has",
    selectionRule: "Equipped creature has haste and shroud",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Sword of Vengeance",
    label: "positive_granted_region",
    category: "equipment_has",
    selectionRule: "Equipped creature has first strike, vigilance, trample, and haste",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Spirit Mantle",
    label: "positive_granted_region",
    category: "enchanted_has",
    selectionRule: "Enchanted creature has protection from creatures",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Holy Avenger",
    label: "positive_granted_region",
    category: "equipment_has",
    selectionRule: "Equipped creature has double strike",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Cathars' Crusade",
    label: "negative_non_granted_region",
    category: "triggered_native",
    selectionRule: "Whenever a creature enters — primary triggered, no quote grant",
    expectedGrantedRegionCount: 0,
  },
  {
    cardName: "Counterspell",
    label: "negative_non_granted_region",
    category: "instant_native",
    selectionRule: "Counter target spell — no granting",
    expectedGrantedRegionCount: 0,
  },
  {
    cardName: "Llanowar Elves",
    label: "negative_non_granted_region",
    category: "activated_native",
    selectionRule: "Tap: Add G — native activated",
    expectedGrantedRegionCount: 0,
  },
  {
    cardName: "Omniscience",
    label: "negative_non_granted_region",
    category: "static_permission",
    selectionRule: "You may cast spells from hand — permission not quote grant",
    expectedGrantedRegionCount: 0,
  },
  {
    cardName: "Doubling Season",
    label: "negative_non_granted_region",
    category: "replacement_native",
    selectionRule: "If an effect would create tokens — replacement not quote grant",
    expectedGrantedRegionCount: 0,
  },
  {
    cardName: "Krenko, Mob Boss",
    label: "positive_granted_region",
    category: "token_definition",
    selectionRule: "Goblin token creation with implicit token type",
    expectedGrantedRegionCount: 0,
  },
  {
    cardName: "Sword of Feast and Famine",
    label: "positive_granted_region",
    category: "equipment_has",
    selectionRule: "Equipped creature has protection",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Steelshaper's Gift",
    label: "negative_non_granted_region",
    category: "search_no_grant",
    selectionRule: "Search for Equipment — no granted ability quote",
    expectedGrantedRegionCount: 0,
  },
  {
    cardName: "Hero's Blade",
    label: "positive_granted_region",
    category: "equipment_has",
    selectionRule: "Equipped creature has haste",
    expectedGrantedRegionCount: 1,
  },
  {
    cardName: "Mirrex",
    label: "positive_granted_region",
    category: "token_definition",
    selectionRule: "Powerstone token with quoted activated ability",
    expectedGrantedRegionCount: 1,
  },
];
