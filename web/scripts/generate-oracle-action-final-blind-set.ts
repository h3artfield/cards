/**
 * Generate sealed final_blind_test_v1 — ≥100 card faces, never parsed until RC gate.
 * Run: npx tsx scripts/generate-oracle-action-final-blind-set.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inferDerivedRoles, type PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { TAXONOMY_VERSION, computeContentHash } from "./oracle-action-eval-shared";

interface BlindSeed {
  name: string;
  category: string;
  text: string;
  layout?: string;
  face?: string;
  primitives: Array<{ actionType: PrimitiveActionType; evidenceContains: string; optional?: boolean }>;
  structure?: OracleActionEvalCaseV2["expectedStructure"];
  forbidden?: PrimitiveActionType[];
}

/** Cards not present in development (204) or validation (104) sets. */
const BLIND_SEEDS: BlindSeed[] = [
  { name: "Swords to Plowshares", category: "blind removal", text: "Exile target creature. Its controller gains life equal to its power.", primitives: [{ actionType: "exile", evidenceContains: "Exile target creature" }, { actionType: "gain_life", evidenceContains: "gains life" }] },
  { name: "Beast Within", category: "blind removal", text: "Destroy target permanent. Its controller creates a 3/3 green Beast creature token.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target permanent" }, { actionType: "create_token", evidenceContains: "creates a 3/3" }] },
  { name: "Chaos Warp", category: "blind removal", text: "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto the battlefield.", primitives: [{ actionType: "shuffle_into_library", evidenceContains: "shuffles it into their library" }] },
  { name: "Cyclonic Rift", category: "blind removal", text: "Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U}", primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target nonland permanent" }] },
  { name: "Vindicate", category: "blind removal", text: "Destroy target permanent.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target permanent" }] },

  { name: "Demonic Tutor", category: "blind tutor", text: "Search your library for a card, put it into your hand, then shuffle.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }] },
  { name: "Diabolic Intent", category: "blind tutor", text: "As an additional cost to cast this spell, sacrifice a creature.\nSearch your library for a card, put that card into your hand, then shuffle.", primitives: [{ actionType: "sacrifice", evidenceContains: "sacrifice a creature" }, { actionType: "search_library", evidenceContains: "Search your library" }] },
  { name: "Imperial Seal", category: "blind tutor", text: "Search your library for a card, then shuffle and put that card on top.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }] },
  { name: "Gamble", category: "blind tutor", text: "Search your library for a card, put it into your hand, shuffle, then discard a card at random.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }, { actionType: "discard", evidenceContains: "discard a card" }] },
  { name: "Wishclaw Talisman", category: "blind tutor", text: "{1}, {T}, Sacrifice this artifact: Search your library for a card, put it into your hand, shuffle, then put a +1/+1 counter on a creature you control.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }, { actionType: "put_counter", evidenceContains: "put a +1/+1 counter" }] },

  { name: "Sol Ring", category: "blind ramp", text: "{T}: Add {C}{C}.", primitives: [{ actionType: "add_mana", evidenceContains: "Add {C}" }] },
  { name: "Mana Crypt", category: "blind ramp", text: "At the beginning of your upkeep, flip a coin. If you lose the flip, this artifact deals 3 damage to you.\n{T}: Add {C}{C}.", primitives: [{ actionType: "add_mana", evidenceContains: "Add {C}" }, { actionType: "deal_damage", evidenceContains: "deals 3 damage" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Three Visits", category: "blind ramp", text: "Search your library for a Forest card, put it onto the battlefield, then shuffle.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }] },
  { name: "Nature's Lore", category: "blind ramp", text: "Search your library for a Forest, Island, Mountain, or Plains card, put it onto the battlefield, then shuffle.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }] },
  { name: "Farseek", category: "blind ramp", text: "Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }] },

  { name: "Rhystic Study", category: "blind draw", text: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.", primitives: [{ actionType: "draw", evidenceContains: "draw a card", optional: true }], structure: { minTriggeredAbilities: 1, optional: true } },
  { name: "Mystic Remora", category: "blind draw", text: "Whenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.", primitives: [{ actionType: "draw", evidenceContains: "draw a card", optional: true }], structure: { minTriggeredAbilities: 1 } },
  { name: "Phyrexian Arena", category: "blind draw", text: "At the beginning of your upkeep, you draw a card and you lose 1 life.", primitives: [{ actionType: "draw", evidenceContains: "draw a card" }, { actionType: "lose_life", evidenceContains: "lose 1 life" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Necropotence", category: "blind draw", text: "Skip your draw step.\nWhenever you discard a card, exile that card from your graveyard.\nPay 1 life: Exile the top card of your library. Put that card into your hand at the beginning of your next end step.", primitives: [{ actionType: "exile", evidenceContains: "Exile the top card" }, { actionType: "draw", evidenceContains: "into your hand" }] },
  { name: "Sylvan Library", category: "blind draw", text: "At the beginning of your draw step, you may draw two additional cards. If you do, choose two cards in your hand drawn this turn. For each of those cards, pay 4 life or put the card on top of your library.", primitives: [{ actionType: "draw", evidenceContains: "draw two additional cards", optional: true }], structure: { minTriggeredAbilities: 1, optional: true } },

  { name: "Rest in Peace", category: "blind replacement", text: "If a card would be put into a graveyard from anywhere, exile it instead.", primitives: [{ actionType: "exile", evidenceContains: "exile it instead" }] },
  { name: "Torpor Orb", category: "blind replacement", text: "Creatures entering don't cause abilities to trigger.", primitives: [], forbidden: ["draw", "destroy"] },
  { name: "Hushbringer", category: "blind replacement", text: "Flash\nFlying\nWhen this creature enters, put a stun counter on target creature.", primitives: [{ actionType: "put_counter", evidenceContains: "stun counter" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Dryad Sophisticate", category: "blind replacement", text: "If a Forest entered under your control this turn, this creature has haste.", primitives: [], forbidden: ["draw"] },
  { name: "Teferi's Protection", category: "blind replacement", text: "Your opponents can't cast spells or activate abilities during your turn.\nAll damage that would be dealt to you and permanents you control this turn is prevented.", primitives: [], forbidden: ["destroy"] },

  { name: "Etali, Primal Storm", category: "blind cast-from-exile", text: "Whenever Etali attacks, exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs.", primitives: [{ actionType: "exile", evidenceContains: "exile the top card" }, { actionType: "cast", evidenceContains: "cast any number of spells" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Omniscience", category: "blind cast-from-exile", text: "You may cast spells from your hand without paying their mana costs.", primitives: [{ actionType: "cast", evidenceContains: "cast spells from your hand" }] },
  { name: "Past in Flames", category: "blind cast-from-exile", text: "Flashback {3}{R}\nEach instant and sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost.", primitives: [{ actionType: "cast", evidenceContains: "gains flashback" }] },
  { name: "Mizzix's Mastery", category: "blind cast-from-exile", text: "Exile all cards from your graveyard. You may cast instant and sorcery spells from among them this turn without paying their mana costs.", primitives: [{ actionType: "exile", evidenceContains: "Exile all cards from your graveyard" }, { actionType: "cast", evidenceContains: "cast instant and sorcery spells" }] },
  { name: "Leyline Binding", category: "blind exile", text: "Flash\nConvoke\nWhen this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.", primitives: [{ actionType: "exile", evidenceContains: "exile target nonland permanent" }], structure: { minTriggeredAbilities: 1 } },

  { name: "Karn's Sylex", category: "blind saga", layout: "saga", text: "I — Destroy each artifact with mana value 2 or less.\nII — Destroy each creature with mana value 2 or less.\nIII — Destroy each enchantment with mana value 2 or less.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy each artifact" }, { actionType: "destroy", evidenceContains: "Destroy each creature" }, { actionType: "destroy", evidenceContains: "Destroy each enchantment" }] },
  { name: "The World Tree", category: "blind saga", layout: "saga", text: "When this land enters, you gain 1 life.\n{T}: Add {G}.\n{G}{G}{G}{G}{G}: Search your library for up to five creature cards, put them onto the battlefield, then shuffle.", primitives: [{ actionType: "gain_life", evidenceContains: "gain 1 life" }, { actionType: "add_mana", evidenceContains: "Add {G}" }, { actionType: "search_library", evidenceContains: "Search your library" }], structure: { minTriggeredAbilities: 1 } },
  { name: "The Mending of Dominaria", category: "blind saga", layout: "saga", text: "I — Put a +1/+1 counter on each creature you control.\nII — Return target creature card from your graveyard to your hand.\nIII — Return all permanent cards from your graveyard to the battlefield.", primitives: [{ actionType: "put_counter", evidenceContains: "Put a +1/+1 counter" }, { actionType: "return_to_battlefield", evidenceContains: "from your graveyard to your hand" }] },

  { name: "Teferi, Time Raveler", category: "blind planeswalker", text: "+1: Until your next turn, you may cast sorcery spells as though they had flash.\n−3: Return target artifact, creature, or enchantment to its owner's hand.\n−8: You get an emblem with \"You may cast spells from your hand without paying their mana costs.\"", primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target artifact" }, { actionType: "cast", evidenceContains: "cast spells from your hand" }] },
  { name: "Ugin, the Spirit Dragon", category: "blind planeswalker", text: "+2: Scry 2.\n−3: Exile target permanent.\n−10: Each opponent loses life equal to the number of permanents they control.", primitives: [{ actionType: "scry", evidenceContains: "Scry 2" }, { actionType: "exile", evidenceContains: "Exile target permanent" }, { actionType: "lose_life", evidenceContains: "loses life" }] },
  { name: "Garruk, Apex Predator", category: "blind planeswalker", text: "+1: Destroy another target creature.\n−3: Target player loses 3 life and you gain 3 life.\n−8: Create a 6/6 green Wurm creature token for each land you control.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy another target creature" }, { actionType: "lose_life", evidenceContains: "loses 3 life" }, { actionType: "gain_life", evidenceContains: "gain 3 life" }, { actionType: "create_token", evidenceContains: "Create a 6/6" }] },

  { name: "Fire // Ice", category: "blind split", layout: "split", text: "Fire deals 2 damage divided as you choose among one or two targets.\n//\nTap target permanent.\nDraw a card.", face: "back", primitives: [{ actionType: "draw", evidenceContains: "Draw a card" }, { actionType: "tap", evidenceContains: "Tap target permanent" }] },
  { name: "Boom // Bust", category: "blind split", layout: "split", text: "Destroy target land.\n//\nDestroy target land and target artifact.", face: "back", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target land" }] },
  { name: "Alive // Well", category: "blind split", layout: "split", text: "All creatures get +2/+2 until end of turn.\n//\nTarget player gains 2 life.", face: "back", primitives: [{ actionType: "gain_life", evidenceContains: "gains 2 life" }] },

  { name: "Archmage's Charm", category: "blind modal", text: "Choose one —\n• Counter target spell.\n• Gain control of target permanent.\n• Draw two cards.", primitives: [{ actionType: "counter", evidenceContains: "Counter target spell" }, { actionType: "draw", evidenceContains: "Draw two cards" }] },
  { name: "Commander's Insight", category: "blind modal", text: "Choose one —\n• Draw three cards.\n• Each player mills three cards.", primitives: [{ actionType: "draw", evidenceContains: "Draw three cards" }, { actionType: "mill", evidenceContains: "mills three cards" }] },
  { name: "Void Rend", category: "blind modal", text: "This spell can't be countered.\nDestroy target nonland permanent.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target nonland permanent" }] },

  { name: "Underworld Breach", category: "blind recursion", text: "During each of your turns, you may play lands and cast spells from your graveyard.", primitives: [{ actionType: "play", evidenceContains: "play lands and cast spells from your graveyard" }] },
  { name: "Muldrotha, the Gravetide", category: "blind recursion", text: "During each of your turns, you may play lands and cast permanents from your graveyard.", primitives: [{ actionType: "play", evidenceContains: "play lands and cast permanents from your graveyard" }] },
  { name: "Meren of Clan Nel Toth", category: "blind recursion", text: "Whenever another creature you control dies, return target creature card with lesser mana value from your graveyard to the battlefield.", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to the battlefield" }], structure: { minTriggeredAbilities: 1 } },

  { name: "Dockside Extortionist", category: "blind token", text: "When this creature enters, create a Treasure token for each artifact and creature your opponents control.", primitives: [{ actionType: "create_token", evidenceContains: "Treasure token" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Tireless Provisioner", category: "blind token", text: "Landfall — Whenever a land you control enters, create a Food token or a Treasure token.", primitives: [{ actionType: "create_token", evidenceContains: "create a Food token" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Saheeli, Sublime Artificer", category: "blind token", text: "+1: Create a 1/1 colorless Servo artifact creature token.\n−2: Target artifact you control becomes a copy of another target artifact or creature you control until end of turn.", primitives: [{ actionType: "create_token", evidenceContains: "Create a 1/1" }, { actionType: "copy", evidenceContains: "becomes a copy" }] },

  { name: "Counterspell", category: "blind counter", text: "Counter target spell.", primitives: [{ actionType: "counter", evidenceContains: "Counter target spell" }] },
  { name: "Mana Drain", category: "blind counter", text: "Counter target spell. At the beginning of your next main phase, add {C}{C}.", primitives: [{ actionType: "counter", evidenceContains: "Counter target spell" }, { actionType: "add_mana", evidenceContains: "Add {C}" }] },
  { name: "Swan Song", category: "blind counter", text: "Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying.", primitives: [{ actionType: "counter", evidenceContains: "Counter target" }, { actionType: "create_token", evidenceContains: "creates a 2/2" }] },

  { name: "Abrupt Decay", category: "blind destroy", text: "Destroy target nonland permanent with mana value 3 or less.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target nonland permanent" }] },
  { name: "Assassin's Trophy", category: "blind destroy", text: "Destroy target permanent an opponent controls. Its controller searches their library for a basic land card, puts it onto the battlefield, then shuffles.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target permanent" }, { actionType: "search_library", evidenceContains: "searches their library" }] },
  { name: "Farewell", category: "blind destroy", text: "Choose one or more —\n• Exile all artifacts.\n• Exile all creatures.\n• Exile all enchantments.\n• Exile all graveyards.", primitives: [{ actionType: "exile", evidenceContains: "Exile all artifacts" }, { actionType: "exile", evidenceContains: "Exile all creatures" }] },

  { name: "Brain Freeze", category: "blind mill", text: "Target player mills three cards.\nStorm", primitives: [{ actionType: "mill", evidenceContains: "mills three cards" }] },
  { name: "Traumatize", category: "blind mill", text: "Target player mills half their library, rounded down.", primitives: [{ actionType: "mill", evidenceContains: "mills half" }] },
  { name: "Consuming Aberration", category: "blind mill", text: "Whenever you draw a card, each opponent mills that many cards.", primitives: [{ actionType: "mill", evidenceContains: "mills that many cards" }], structure: { minTriggeredAbilities: 1 } },

  { name: "Hero's Downfall", category: "blind removal", text: "Destroy target creature or planeswalker.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target creature" }] },
  { name: "Anguished Unmaking", category: "blind removal", text: "Exile target nonland permanent. You lose 3 life.", primitives: [{ actionType: "exile", evidenceContains: "Exile target nonland permanent" }, { actionType: "lose_life", evidenceContains: "lose 3 life" }] },
  { name: "Grind // Dust", category: "blind split", layout: "split", text: "Target player mills X cards, where X is the number of cards in your hand.\n//\nDestroy all artifacts and enchantments.", face: "back", primitives: [{ actionType: "mill", evidenceContains: "mills X cards" }, { actionType: "destroy", evidenceContains: "Destroy all artifacts" }] },

  { name: "Elvish Spirit Guide", category: "blind ramp", text: "Exile this card from your hand: Add {G}.", primitives: [{ actionType: "exile", evidenceContains: "Exile this card from your hand" }, { actionType: "add_mana", evidenceContains: "Add {G}" }] },
  { name: "Simian Spirit Guide", category: "blind ramp", text: "Exile this card from your hand: Add {R}.", primitives: [{ actionType: "exile", evidenceContains: "Exile this card from your hand" }, { actionType: "add_mana", evidenceContains: "Add {R}" }] },
  { name: "Lotus Petal", category: "blind ramp", text: "{T}, Sacrifice this artifact: Add one mana of any color.", primitives: [{ actionType: "sacrifice", evidenceContains: "Sacrifice this artifact" }, { actionType: "add_mana", evidenceContains: "Add one mana" }] },

  { name: "Silence", category: "blind static", text: "Your opponents can't cast spells during your turn.", primitives: [], forbidden: ["draw", "counter"] },
  { name: "Grand Abolisher", category: "blind static", text: "During your turn, your opponents can't cast spells or activate abilities of artifacts, creatures, or enchantments.", primitives: [], forbidden: ["draw"] },
  { name: "Drannith Magistrate", category: "blind static", text: "Your opponents can't cast spells from anywhere other than their hand.", primitives: [], forbidden: ["counter"] },

  { name: "Veil of Summer", category: "blind protection", text: "Draw a card.\nYour opponents can't cast blue or black spells this turn.", primitives: [{ actionType: "draw", evidenceContains: "Draw a card" }], forbidden: ["destroy"] },
  { name: "Autumn's Veil", category: "blind protection", text: "Your opponents can't cast blue or black spells this turn.", primitives: [], forbidden: ["draw"] },
  { name: "Heroic Intervention", category: "blind protection", text: "Permanents you control gain hexproof and indestructible until end of turn.", primitives: [], forbidden: ["destroy"] },

  { name: "Thassa's Oracle", category: "blind combo", text: "When this creature enters, scry 1.\nWhen you cast this spell, look at the top X cards of your library, where X is the amount of mana spent to cast it. Put one of those cards into your hand and the rest on the bottom of your library in a random order.", primitives: [{ actionType: "scry", evidenceContains: "scry 1" }, { actionType: "draw", evidenceContains: "into your hand" }], structure: { minTriggeredAbilities: 2 } },
  { name: "Laboratory Maniac", category: "blind combo", text: "If you would draw a card while your library has no cards in it, you win the game instead.", primitives: [], forbidden: ["draw"] },
  { name: "Jace, Wielder of Mysteries", category: "blind combo", text: "If you would draw a card while your library has no cards in it, you win the game instead.\n+1: Target player puts the top two cards of their library into their graveyard.", primitives: [{ actionType: "mill", evidenceContains: "into their graveyard" }] },

  { name: "Narset's Reversal", category: "blind copy", text: "Copy target instant or sorcery spell, then return it to its owner's hand.", primitives: [{ actionType: "copy", evidenceContains: "Copy target instant" }, { actionType: "return_to_hand", evidenceContains: "return it to its owner's hand" }] },
  { name: "Ral, Storm Conduit", category: "blind copy", text: "Whenever you cast an instant or sorcery spell, copy that spell. You may choose new targets for the copy.", primitives: [{ actionType: "copy", evidenceContains: "copy that spell" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Dualcaster Mage", category: "blind copy", text: "Flash\nWhen this creature enters, copy target instant or sorcery spell. You may choose new targets for the copy.", primitives: [{ actionType: "copy", evidenceContains: "copy target instant" }], structure: { minTriggeredAbilities: 1 } },

  { name: "Path to Exile", category: "blind compound", text: "Exile target creature. Its controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle.", primitives: [{ actionType: "exile", evidenceContains: "Exile target creature" }, { actionType: "search_library", evidenceContains: "search their library", optional: true }] },
  { name: "Prismatic Ending", category: "blind compound", text: "Converge — Exile target nonland permanent if its mana value is less than or equal to the number of colors of mana spent to cast this spell.", primitives: [{ actionType: "exile", evidenceContains: "Exile target nonland permanent" }] },
  { name: "Teferi, Hero of Dominaria", category: "blind planeswalker", text: "+1: Draw a card. At the beginning of the next end step, untap two lands.\n−3: Put target nonland permanent into its owner's library third from the top.\n−8: You get an emblem with \"Whenever you draw a card, exile target permanent an opponent controls.\"", primitives: [{ actionType: "draw", evidenceContains: "Draw a card" }, { actionType: "exile", evidenceContains: "exile target permanent" }] },

  { name: "Crop Rotation", category: "blind tutor", text: "As an additional cost to cast this spell, sacrifice a land.\nSearch your library for a land card, put it onto the battlefield, then shuffle.", primitives: [{ actionType: "sacrifice", evidenceContains: "sacrifice a land" }, { actionType: "search_library", evidenceContains: "Search your library" }] },
  { name: "Enlightened Tutor", category: "blind tutor", text: "Search your library for an artifact or enchantment card, reveal it, put it into your hand, then shuffle.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }] },
  { name: "Mystical Tutor", category: "blind tutor", text: "Search your library for an instant or sorcery card, reveal it, put it into your hand, then shuffle.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }] },
  { name: "Worldly Tutor", category: "blind tutor", text: "Search your library for a creature card, reveal it, put it into your hand, then shuffle.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }] },
  { name: "Vampiric Tutor", category: "blind tutor", text: "Search your library for a card, shuffle, put that card on top of your library, then lose 3 life.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }, { actionType: "lose_life", evidenceContains: "lose 3 life" }] },

  { name: "Wrath of God", category: "blind wipe", text: "Destroy all creatures. They can't be regenerated.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy all creatures" }] },
  { name: "Damnation", category: "blind wipe", text: "Destroy all creatures. They can't be regenerated.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy all creatures" }] },
  { name: "Toxic Deluge", category: "blind wipe", text: "As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.", primitives: [{ actionType: "lose_life", evidenceContains: "pay X life" }] },

  { name: "Enlightened Tutor", category: "blind extra", text: "Search your library for an artifact or enchantment card, reveal it, put it into your hand, then shuffle.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }] },
  { name: "Negate", category: "blind extra", text: "Counter target noncreature spell.", primitives: [{ actionType: "counter", evidenceContains: "Counter target noncreature" }] },
  { name: "Dispel", category: "blind extra", text: "Counter target instant spell.", primitives: [{ actionType: "counter", evidenceContains: "Counter target instant" }] },
  { name: "Flusterstorm", category: "blind extra", text: "Counter target instant or sorcery spell unless its controller pays {1}.\nStorm", primitives: [{ actionType: "counter", evidenceContains: "Counter target instant" }] },
  { name: "Red Elemental Blast", category: "blind extra", text: "Choose one —\n• Counter target spell if it's blue.\n• Destroy target blue permanent.", primitives: [{ actionType: "counter", evidenceContains: "Counter target spell" }, { actionType: "destroy", evidenceContains: "Destroy target blue permanent" }] },
  { name: "Pyroblast", category: "blind extra", text: "Choose one —\n• Counter target spell if it's red.\n• Destroy target red permanent.", primitives: [{ actionType: "counter", evidenceContains: "Counter target spell" }, { actionType: "destroy", evidenceContains: "Destroy target red permanent" }] },
  { name: "Veil of Summer", category: "blind extra-2", text: "Draw a card.\nYour opponents can't cast blue or black spells this turn.", primitives: [{ actionType: "draw", evidenceContains: "Draw a card" }] },
  { name: "Nature's Claim", category: "blind extra-2", text: "Destroy target artifact or enchantment. Its controller gains 4 life.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target artifact" }, { actionType: "gain_life", evidenceContains: "gains 4 life" }] },
  { name: "Return to Nature", category: "blind extra-2", text: "Choose one —\n• Destroy target artifact.\n• Destroy target enchantment.\n• Counter target artifact or enchantment spell.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target artifact" }, { actionType: "counter", evidenceContains: "Counter target artifact" }] },
  { name: "Wear // Tear", category: "blind extra split", layout: "split", text: "Destroy target artifact.\n//\nDestroy target enchantment.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target artifact" }, { actionType: "destroy", evidenceContains: "Destroy target enchantment" }] },
  { name: "Bala Ged Recovery // Bala Ged Sanctuary", category: "blind mdfc", layout: "modal_dfc", text: "Return target card from your graveyard to your hand.\n//\nThis land enters tapped.", face: "front", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to your hand" }] },
  { name: "Shatterskull Smashing // Shatterskull, the Hammer Pass", category: "blind mdfc", layout: "modal_dfc", text: "Shatterskull Smashing deals X damage divided as you choose among one or two targets.\n//\nThis land enters tapped.", face: "front", primitives: [{ actionType: "deal_damage", evidenceContains: "deals X damage" }] },
  { name: "Turntimber Symbiosis // Turntimber, Serpentine Wood", category: "blind mdfc", layout: "modal_dfc", text: "Look at the top ten cards of your library. You may put a creature card with mana value 3 or less from among them onto the battlefield. Put the rest on the bottom of your library in a random order.", face: "front", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "onto the battlefield" }] },
  { name: "Emeria's Call // Emeria, Shattered Skyclave", category: "blind mdfc", layout: "modal_dfc", text: "Create two 1/1 white Spirit creature tokens with flying.\n//\nThis land enters tapped.", face: "front", primitives: [{ actionType: "create_token", evidenceContains: "Create two 1/1" }] },
  { name: "Sevinne's Reclamation", category: "blind flashback", text: "Return target permanent card with mana value 3 or less from your graveyard to the battlefield.\nFlashback {4}{W}", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to the battlefield" }] },
  { name: "Unearth", category: "blind flashback", text: "Return target creature card with mana value 3 or less from your graveyard to the battlefield.\nCycling {2}", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to the battlefield" }] },
  { name: "Persist", category: "blind recursion", text: "Return target nonlegendary permanent card from your graveyard to the battlefield with a -1/-1 counter on it.", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to the battlefield" }] },
  { name: "Bond of Revival", category: "blind recursion", text: "Return target creature card from your graveyard to the battlefield. It gains haste until your next turn.", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to the battlefield" }] },
  { name: "Agadeem's Awakening // Agadeem, the Undercrypt", category: "blind mdfc", layout: "modal_dfc", text: "Return from your graveyard to the battlefield any number of creature cards that have different mana values.", face: "front", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to the battlefield" }] },
  { name: "Green Sun's Zenith", category: "blind tutor", text: "Search your library for a green creature card with mana value X or less, put it onto the battlefield, then shuffle.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }] },
  { name: "Finale of Devastation", category: "blind tutor", text: "Search your library and/or graveyard for a creature card with mana value X or less and put it onto the battlefield.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }, { actionType: "return_to_battlefield", evidenceContains: "put it onto the battlefield" }] },
];

function buildBlindCases(): OracleActionEvalCaseV2[] {
  const seen = new Set<string>();
  const cases: OracleActionEvalCaseV2[] = [];

  for (const seed of BLIND_SEEDS) {
    const key = `${seed.name}:${seed.text.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const idx = cases.length + 1;
    const primitives = seed.primitives.map((p) => ({
      actionType: p.actionType,
      evidenceContains: p.evidenceContains,
      cardFace: seed.face,
      optional: p.optional,
    }));
    const roles = inferDerivedRoles(primitives.map((p) => p.actionType));

    cases.push({
      id: `blind-${String(idx).padStart(4, "0")}`,
      category: seed.category,
      layout: seed.layout,
      oracleId: `blind-oracle-${idx}`,
      oracleText: seed.text,
      cardFace: seed.face,
      expectedStructure: seed.structure,
      expectedPrimitiveActions: primitives,
      expectedRoles: roles.length
        ? roles.map((role) => ({
            role,
            fromPrimitiveActions: primitives.map((p) => p.actionType).filter(Boolean),
          }))
        : undefined,
      forbiddenPrimitiveActions: seed.forbidden,
    });
  }

  return cases;
}

function main() {
  const cases = buildBlindCases();
  const contentHash = computeContentHash(cases);
  const frozenAt = new Date().toISOString();

  const payload = {
    setClassification: "final_blind_test_v1",
    evaluationVersion: "final-blind-v1",
    contentHash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: cases.length,
    frozenAt,
    sealed: true,
    usagePolicy:
      "Do not run parser against this set until a release candidate passes development and validation gates. Single evaluation run only.",
    categoryCounts: Object.fromEntries(
      [...new Set(cases.map((c) => c.category))].map((cat) => [cat, cases.filter((c) => c.category === cat).length]),
    ),
    cases,
  };

  const outPath = resolve(process.cwd(), "data", "oracle-action-eval-final-blind-v1.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-final-blind-manifest.json");

  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        setClassification: "final_blind_test_v1",
        contentHash,
        caseCount: cases.length,
        taxonomyVersion: TAXONOMY_VERSION,
        frozenAt,
        path: "data/oracle-action-eval-final-blind-v1.json",
        parserAccessPolicy: "BLOCKED until --allow-final-blind on release candidate eval",
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Generated ${cases.length} sealed final blind cases`);
  console.log(`  contentHash: ${contentHash}`);
  console.log(`  → ${outPath}`);
}

main();
