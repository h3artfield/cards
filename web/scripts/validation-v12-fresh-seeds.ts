/**
 * validation_set_v12_fresh seeds — coverage-stratified, zero overlap with prior benchmarks.
 * Gold derived from catalog oracle + three-layer-v1.3 policy at seal time.
 */
export type ValidationV12Stratum =
  | "simple_single_action"
  | "compound_actions"
  | "activated_abilities"
  | "triggered_abilities"
  | "replacement_effects"
  | "static_permissions_restrictions"
  | "modal_cards"
  | "saga_planeswalker"
  | "multiface"
  | "granted_abilities"
  | "zone_transitions"
  | "variable_quantities"
  | "search_put_shuffle"
  | "recursion"
  | "optional_if_you_do"
  | "reminder_heavy_mechanics";

export interface ValidationV12Seed {
  name: string;
  stratum: ValidationV12Stratum;
  layout?: string;
  face?: string;
}

export const VALIDATION_V12_FRESH_SEEDS: ValidationV12Seed[] = [
  // simple_single_action (15)
  { name: "Lightning Strike", stratum: "simple_single_action" },
  { name: "Shock", stratum: "simple_single_action" },
  { name: "Murder", stratum: "simple_single_action" },
  { name: "Cancel", stratum: "simple_single_action" },
  { name: "Giant Growth", stratum: "simple_single_action" },
  { name: "Dark Ritual", stratum: "simple_single_action" },
  { name: "Healing Salve", stratum: "simple_single_action" },
  { name: "Disenchant", stratum: "simple_single_action" },
  { name: "Naturalize", stratum: "simple_single_action" },
  { name: "Essence Scatter", stratum: "simple_single_action" },
  { name: "Doom Blade", stratum: "simple_single_action" },
  { name: "Path to Exile", stratum: "simple_single_action" },
  { name: "Thoughtseize", stratum: "simple_single_action" },
  { name: "Swords to Plowshares", stratum: "simple_single_action" },
  { name: "Beast Within", stratum: "simple_single_action" },

  // compound_actions (12)
  { name: "Faithless Looting", stratum: "compound_actions" },
  { name: "Night's Whisper", stratum: "compound_actions" },
  { name: "Read the Bones", stratum: "compound_actions" },
  { name: "Chart a Course", stratum: "compound_actions" },
  { name: "Telling Time", stratum: "compound_actions" },
  { name: "Serum Visions", stratum: "compound_actions" },
  { name: "Sleight of Hand", stratum: "compound_actions" },
  { name: "Deep Analysis", stratum: "compound_actions" },
  { name: "Tear Asunder", stratum: "compound_actions" },
  { name: "Putrefy", stratum: "compound_actions" },
  { name: "Mortify", stratum: "compound_actions" },
  { name: "Terminate", stratum: "compound_actions" },

  // activated_abilities (12)
  { name: "Grim Monolith", stratum: "activated_abilities" },
  { name: "Basalt Monolith", stratum: "activated_abilities" },
  { name: "Crystal Vein", stratum: "activated_abilities" },
  { name: "Mutavault", stratum: "activated_abilities" },
  { name: "Crawling Barrens", stratum: "activated_abilities" },
  { name: "Reliquary Tower", stratum: "activated_abilities" },
  { name: "Inkmoth Nexus", stratum: "activated_abilities" },
  { name: "Blinkmoth Nexus", stratum: "activated_abilities" },
  { name: "Cavern of Souls", stratum: "activated_abilities" },
  { name: "Boseiju, Who Endures", stratum: "activated_abilities" },
  { name: "Otawara, Soaring City", stratum: "activated_abilities" },
  { name: "Takenuma, Abandoned Mire", stratum: "activated_abilities" },

  // triggered_abilities (12)
  { name: "Soul Warden", stratum: "triggered_abilities" },
  { name: "Soul's Attendant", stratum: "triggered_abilities" },
  { name: "Zulaport Cutthroat", stratum: "triggered_abilities" },
  { name: "Blood Artist", stratum: "triggered_abilities" },
  { name: "Elvish Visionary", stratum: "triggered_abilities" },
  { name: "Mulldrifter", stratum: "triggered_abilities" },
  { name: "Sea Gate Oracle", stratum: "triggered_abilities" },
  { name: "Guttersnipe", stratum: "triggered_abilities" },
  { name: "Tormenting Voice", stratum: "triggered_abilities" },
  { name: "Young Pyromancer", stratum: "triggered_abilities" },
  { name: "Monastery Swiftspear", stratum: "triggered_abilities" },
  { name: "Ledger Shredder", stratum: "triggered_abilities" },

  // replacement_effects (8)
  { name: "Rest in Peace", stratum: "replacement_effects" },
  { name: "Leyline of the Void", stratum: "replacement_effects" },
  { name: "Grafdigger's Cage", stratum: "replacement_effects" },
  { name: "Suppression Field", stratum: "replacement_effects" },
  { name: "Teferi's Protection", stratum: "replacement_effects" },
  { name: "Torpor Orb", stratum: "replacement_effects" },
  { name: "Hushbringer", stratum: "replacement_effects" },
  { name: "Dryad Sophisticate", stratum: "replacement_effects" },

  // static_permissions_restrictions (10)
  { name: "Rule of Law", stratum: "static_permissions_restrictions" },
  { name: "Eidolon of Rhetoric", stratum: "static_permissions_restrictions" },
  { name: "Deafening Silence", stratum: "static_permissions_restrictions" },
  { name: "Chalice of the Void", stratum: "static_permissions_restrictions" },
  { name: "Trinisphere", stratum: "static_permissions_restrictions" },
  { name: "Winter Orb", stratum: "static_permissions_restrictions" },
  { name: "Static Orb", stratum: "static_permissions_restrictions" },
  { name: "Blood Moon", stratum: "static_permissions_restrictions" },
  { name: "Magus of the Moon", stratum: "static_permissions_restrictions" },
  { name: "Stony Silence", stratum: "static_permissions_restrictions" },

  // modal_cards (10)
  { name: "Commandeer", stratum: "modal_cards" },
  { name: "Archmage's Charm", stratum: "modal_cards" },
  { name: "Deprive", stratum: "modal_cards" },
  { name: "Logic Knot", stratum: "modal_cards" },
  { name: "Supreme Verdict", stratum: "modal_cards" },
  { name: "Drown in the Loch", stratum: "modal_cards" },
  { name: "Klothys's Design", stratum: "modal_cards" },
  { name: "Decree of Justice", stratum: "modal_cards" },
  { name: "Orim's Chant", stratum: "modal_cards" },
  { name: "Silence", stratum: "modal_cards" },

  // saga_planeswalker (10)
  { name: "The Eldest Reborn", stratum: "saga_planeswalker", layout: "saga" },
  { name: "The First Eruption", stratum: "saga_planeswalker", layout: "saga" },
  { name: "The Antiquities War", stratum: "saga_planeswalker", layout: "saga" },
  { name: "Phyrexian Arena", stratum: "saga_planeswalker" },
  { name: "Jace, the Mind Sculptor", stratum: "saga_planeswalker" },
  { name: "Liliana of the Veil", stratum: "saga_planeswalker" },
  { name: "Chandra, Torch of Defiance", stratum: "saga_planeswalker" },
  { name: "Wrenn and Six", stratum: "saga_planeswalker" },
  { name: "Oko, Thief of Crowns", stratum: "saga_planeswalker" },
  { name: "Teferi, Hero of Dominaria", stratum: "saga_planeswalker" },

  // multiface (12)
  { name: "Delver of Secrets // Insectile Aberration", stratum: "multiface", layout: "transform" },
  { name: "Lunarch Inquisitors // Avacyn's Judgment", stratum: "multiface", layout: "transform" },
  { name: "Claim // Fame", stratum: "multiface", layout: "split" },
  { name: "Never // Return", stratum: "multiface", layout: "split" },
  { name: "Brazen Borrower // Petty Theft", stratum: "multiface", layout: "adventure" },
  { name: "Murktide Regent", stratum: "multiface" },
  { name: "Valki, God of Lies // Tibalt, Cosmic Impostor", stratum: "multiface", layout: "modal_dfc" },
  { name: "Zagras, Thief of Heartbeats", stratum: "multiface" },
  { name: "Brightclimb Pathway // Grimclimb Pathway", stratum: "multiface", layout: "modal_dfc" },
  { name: "Sea Gate Restoration // Sea Gate, Reborn", stratum: "multiface", layout: "modal_dfc" },
  { name: "Turntimber Symbiosis // Turntimber, Serpentine Wood", stratum: "multiface", layout: "modal_dfc" },
  { name: "Shatterskull Smashing // Shatterskull, the Hammer Pass", stratum: "multiface", layout: "modal_dfc" },

  // granted_abilities (8)
  { name: "Archetype of Imagination", stratum: "granted_abilities" },
  { name: "Archetype of Endurance", stratum: "granted_abilities" },
  { name: "Archetype of Aggression", stratum: "granted_abilities" },
  { name: "Sulfuric Vortex", stratum: "granted_abilities" },
  { name: "Awakening Zone", stratum: "granted_abilities" },
  { name: "Concordant Crossroads", stratum: "granted_abilities" },
  { name: "Hall of the Bandit Lord", stratum: "granted_abilities" },
  { name: "Homeward Path", stratum: "granted_abilities" },

  // zone_transitions (10)
  { name: "Unearth", stratum: "zone_transitions" },
  { name: "Persist", stratum: "zone_transitions" },
  { name: "Recurring Nightmare", stratum: "zone_transitions" },
  { name: "Animate Dead", stratum: "zone_transitions" },
  { name: "Dance of the Dead", stratum: "zone_transitions" },
  { name: "Necromancy", stratum: "zone_transitions" },
  { name: "Living End", stratum: "zone_transitions" },
  { name: "Golgari Grave-Troll", stratum: "zone_transitions" },
  { name: "Stinkweed Imp", stratum: "zone_transitions" },
  { name: "Life from the Loam", stratum: "zone_transitions" },

  // variable_quantities (8)
  { name: "Bonfire of the Damned", stratum: "variable_quantities" },
  { name: "Comet Storm", stratum: "variable_quantities" },
  { name: "Blue Sun's Zenith", stratum: "variable_quantities" },
  { name: "Entreat the Angels", stratum: "variable_quantities" },
  { name: "Mass Manipulation", stratum: "variable_quantities" },
  { name: "Concentrate", stratum: "variable_quantities" },
  { name: "Pull from Tomorrow", stratum: "variable_quantities" },
  { name: "Revival // Revenge", stratum: "variable_quantities", layout: "split" },

  // search_put_shuffle (8)
  { name: "Cultivate", stratum: "search_put_shuffle" },
  { name: "Kodama's Reach", stratum: "search_put_shuffle" },
  { name: "Rampant Growth", stratum: "search_put_shuffle" },
  { name: "Farseek", stratum: "search_put_shuffle" },
  { name: "Nature's Lore", stratum: "search_put_shuffle" },
  { name: "Three Visits", stratum: "search_put_shuffle" },
  { name: "Skyshroud Claim", stratum: "search_put_shuffle" },
  { name: "Harrow", stratum: "search_put_shuffle" },

  // recursion (8)
  { name: "Snapcaster Mage", stratum: "recursion" },
  { name: "Arclight Phoenix", stratum: "recursion" },
  { name: "Bloodghast", stratum: "recursion" },
  { name: "Prized Amalgam", stratum: "recursion" },
  { name: "Stitcher's Supplier", stratum: "recursion" },
  { name: "Grief", stratum: "recursion" },
  { name: "Solitude", stratum: "recursion" },
  { name: "Fury", stratum: "recursion" },

  // optional_if_you_do (8)
  { name: "Remand", stratum: "optional_if_you_do" },
  { name: "Exclude", stratum: "optional_if_you_do" },
  { name: "Mana Leak", stratum: "optional_if_you_do" },
  { name: "Dismember", stratum: "optional_if_you_do" },
  { name: "Lightning Helix", stratum: "optional_if_you_do" },
  { name: "Blossoming Defense", stratum: "optional_if_you_do" },
  { name: "Apostle's Blessing", stratum: "optional_if_you_do" },
  { name: "Autumn's Veil", stratum: "optional_if_you_do" },

  // reminder_heavy_mechanics (7)
  { name: "Treasure Cove", stratum: "reminder_heavy_mechanics" },
  { name: "Investigator's Journal", stratum: "reminder_heavy_mechanics" },
  { name: "Ovalchase Daredevil", stratum: "reminder_heavy_mechanics" },
  { name: "Thopter Spy Network", stratum: "reminder_heavy_mechanics" },
  { name: "Brass's Trophy", stratum: "reminder_heavy_mechanics" },
  { name: "Mechanized Production", stratum: "reminder_heavy_mechanics" },
  { name: "Saheeli, Sublime Artificer", stratum: "reminder_heavy_mechanics" },
];

export const VALIDATION_V12_TARGET_COUNT = VALIDATION_V12_FRESH_SEEDS.length;
