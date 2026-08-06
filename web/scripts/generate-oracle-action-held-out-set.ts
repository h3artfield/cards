/**
 * Generate ≥100 held-out card-face evaluation cases (never used for parser rule tuning).
 * Run: npx tsx scripts/generate-oracle-action-held-out-set.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inferDerivedRoles, type PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { TAXONOMY_VERSION, EVALUATION_VERSION, computeContentHash } from "./oracle-action-eval-shared";

interface HeldOutSeed {
  name: string;
  category: string;
  text: string;
  layout?: string;
  face?: string;
  primitives: Array<{ actionType: PrimitiveActionType; evidenceContains: string; optional?: boolean }>;
  structure?: OracleActionEvalCaseV2["expectedStructure"];
  forbidden?: PrimitiveActionType[];
}

const HELD_OUT_SEEDS: HeldOutSeed[] = [
  // Split / MDFC / adventure
  { name: "Commit // Memory", category: "held-out split/mdfc", layout: "split", text: "Target player puts the top four cards of their library into their graveyard.\n//\nDraw two cards.", face: "back", primitives: [{ actionType: "draw", evidenceContains: "Draw two cards" }] },
  { name: "Incubate // Synthesize", category: "held-out split/mdfc", layout: "split", text: "Create a 0/0 green and blue Fractal creature token.\n//\nPut a +1/+1 counter on target creature.", primitives: [{ actionType: "create_token", evidenceContains: "Create a 0/0" }, { actionType: "put_counter", evidenceContains: "Put a +1/+1 counter" }] },
  { name: "Valki, God of Lies // Tibalt, Cosmic Impostor", category: "held-out split/mdfc", layout: "modal_dfc", text: "When Valki enters, reveal the top card of target player's library. You may cast a spell with mana value 2 or less from it without paying its mana cost.\n//\n+2: Exile the top card of each player's library.", face: "back", primitives: [{ actionType: "exile", evidenceContains: "Exile the top card" }] },
  { name: "Sea Gate Restoration // Sea Gate, Reborn", category: "held-out split/mdfc", layout: "modal_dfc", text: "Draw cards equal to the number of cards in your hand, then discard a card.\n//\nAs this land enters, you may pay 3 life. If you don't, it enters tapped.", primitives: [{ actionType: "draw", evidenceContains: "Draw cards" }, { actionType: "discard", evidenceContains: "discard a card" }] },
  { name: "Find // Finality", category: "held-out split/mdfc", layout: "split", text: "Return up to two target creature cards from your graveyard to your hand.\n//\nExile one or two target cards from graveyards.", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to your hand" }, { actionType: "exile", evidenceContains: "Exile one or two target cards" }] },

  // Compound effects
  { name: "Ponder", category: "held-out compound", text: "Look at the top three cards of your library, then put them back in any order. You may shuffle.", primitives: [{ actionType: "scry", evidenceContains: "Look at the top three cards" }] },
  { name: "Preordain", category: "held-out compound", text: "Scry 2, then draw a card.", primitives: [{ actionType: "scry", evidenceContains: "Scry 2" }, { actionType: "draw", evidenceContains: "draw a card" }] },
  { name: "Fact or Fiction", category: "held-out compound", text: "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard.", primitives: [{ actionType: "draw", evidenceContains: "into your hand" }, { actionType: "mill", evidenceContains: "into your graveyard" }] },
  { name: "Gifts Ungiven", category: "held-out compound", text: "Search your library for up to four cards with different names and reveal them. Target opponent chooses two of those cards. Put the chosen cards into your graveyard and the rest into your hand. Then shuffle.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }] },
  { name: "Windfall", category: "held-out compound", text: "Each player discards their hand, then draws cards equal to the number of cards they discarded this way.", primitives: [{ actionType: "discard", evidenceContains: "discards their hand" }, { actionType: "draw", evidenceContains: "draws cards" }] },

  // Cast/play from exile
  { name: "Squee, the Immortal", category: "held-out cast-from-exile", text: "You may cast this card from your graveyard or from exile.", primitives: [{ actionType: "cast", evidenceContains: "cast this card from" }] },
  { name: "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki", category: "held-out cast-from-exile", layout: "saga", text: "When this Saga enters and whenever you attack, create a 2/2 red Goblin creature token.\n{2}, Sacrifice this enchantment: Draw a card.", primitives: [{ actionType: "create_token", evidenceContains: "create a 2/2" }, { actionType: "draw", evidenceContains: "Draw a card" }, { actionType: "sacrifice", evidenceContains: "Sacrifice this enchantment" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Mind's Desire", category: "held-out cast-from-exile", text: "Shuffle your library. Then exile the top card of your library. Until end of turn, you may play that card without paying its mana cost.", primitives: [{ actionType: "exile", evidenceContains: "exile the top card" }, { actionType: "cast", evidenceContains: "play that card" }] },
  { name: "Goblin Dark-Dwellers", category: "held-out cast-from-exile", text: "When this creature enters, you may cast target instant or sorcery card with mana value 3 or less from your graveyard without paying its mana cost.", primitives: [{ actionType: "cast", evidenceContains: "cast target instant" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Hollowborn Barghest", category: "held-out cast-from-exile", text: "Whenever this creature attacks, you may cast target instant or sorcery card from your graveyard without paying its mana cost.", primitives: [{ actionType: "cast", evidenceContains: "cast target instant" }], structure: { minTriggeredAbilities: 1 } },

  // Replacement effects
  { name: "Leyline of the Void", category: "held-out replacement", text: "If a card would be put into an opponent's graveyard from anywhere, exile it instead.", primitives: [{ actionType: "exile", evidenceContains: "exile it instead" }] },
  { name: "Grafdigger's Cage", category: "held-out replacement", text: "Creature cards in graveyards and libraries can't enter the battlefield.\nPlayers can't cast spells from graveyards or libraries.", primitives: [], forbidden: ["draw", "destroy", "cast"] },
  { name: "Yasharn, Implacable Earth", category: "held-out replacement", text: "If a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.", primitives: [], forbidden: ["draw"] },
  { name: "Flawless Maneuver", category: "held-out replacement", text: "If you control a commander, you may cast this spell without paying its mana cost.\nCreatures you control gain indestructible until end of turn.", primitives: [], forbidden: ["destroy"] },
  { name: "Dress Down", category: "held-out replacement", text: "When this enchantment enters, draw a card.\nCreatures lose all abilities.", primitives: [{ actionType: "draw", evidenceContains: "draw a card" }], structure: { minTriggeredAbilities: 1 } },

  // Modal
  { name: "Abzan Charm", category: "held-out modal", text: "Choose one —\n• Exile target creature with power 3 or greater.\n• Counter target noncreature spell.\n• Draw two cards.", primitives: [{ actionType: "exile", evidenceContains: "Exile target creature" }, { actionType: "counter", evidenceContains: "Counter target" }, { actionType: "draw", evidenceContains: "Draw two cards" }] },
  { name: "Silumgar's Command", category: "held-out modal", text: "Choose two —\n• Counter target noncreature spell.\n• Return target permanent to its owner's hand.\n• Target creature gets -3/-3 until end of turn.\n• Destroy target planeswalker.", primitives: [{ actionType: "counter", evidenceContains: "Counter target" }, { actionType: "return_to_hand", evidenceContains: "Return target permanent" }, { actionType: "destroy", evidenceContains: "Destroy target planeswalker" }] },
  { name: "Depopulate", category: "held-out modal", text: "Each player chooses a creature type. Destroy all creatures not of the chosen types.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy all creatures" }] },
  { name: "Revitalize", category: "held-out modal", text: "You gain 3 life.\nDraw a card.", primitives: [{ actionType: "gain_life", evidenceContains: "gain 3 life" }, { actionType: "draw", evidenceContains: "Draw a card" }] },
  { name: "Growth Spiral", category: "held-out modal", text: "Draw a card.\nYou may put a land card from your hand onto the battlefield.", primitives: [{ actionType: "draw", evidenceContains: "Draw a card" }] },

  // Sagas
  { name: "The Akroan War", category: "held-out saga", layout: "saga", text: "(As this Saga enters and after your draw step, add a lore counter.)\nI — Each player gains control of all creatures target opponent controls until end of turn.\nII — Each player gains control of all creatures target opponent controls until end of turn.\nIII — Each player gains control of all creatures target opponent controls until end of turn.", primitives: [], forbidden: ["draw", "destroy"] },
  { name: "Binding the Old Gods", category: "held-out saga", layout: "saga", text: "I — Search your library for a Forest, Swamp, or basic land card, put it onto the battlefield tapped, then shuffle.\nII — Return target creature or planeswalker to its owner's hand.\nIII — Destroy target nonland permanent.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }, { actionType: "return_to_hand", evidenceContains: "Return target creature" }, { actionType: "destroy", evidenceContains: "Destroy target nonland" }] },
  { name: "The Mirari Conjecture", category: "held-out saga", layout: "saga", text: "I — Return target instant card from your graveyard to your hand.\nII — When you cast your next instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy.\nIII — Return target instant or sorcery card from your graveyard to your hand.", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to your hand" }, { actionType: "copy", evidenceContains: "copy that spell" }] },
  { name: "The First Iroan Games", category: "held-out saga", layout: "saga", text: "I — Put a +1/+1 counter on each creature you control.\nII — Draw a card for each creature you control with a +1/+1 counter on it.\nIII — Create a 1/1 green Satyr creature token for each creature you control.", primitives: [{ actionType: "put_counter", evidenceContains: "Put a +1/+1 counter" }, { actionType: "draw", evidenceContains: "Draw a card" }, { actionType: "create_token", evidenceContains: "Create a 1/1" }] },
  { name: "Storm the Festival", category: "held-out saga", layout: "saga", text: "I — Return target creature card with mana value 2 or less from your graveyard to the battlefield.\nII — Return target creature card with mana value 2 or less from your graveyard to the battlefield.\nIII — Return target creature card with mana value 2 or less from your graveyard to the battlefield.", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to the battlefield" }] },

  // Planeswalkers
  { name: "Teferi, Hero of Dominaria", category: "held-out planeswalker", text: "+1: Draw a card. At the beginning of the next end step, untap two lands.\n−3: Put target nonland permanent into its owner's library third from the top.\n−8: You get an emblem with \"Whenever you draw a card, exile target permanent an opponent controls.\"", primitives: [{ actionType: "draw", evidenceContains: "Draw a card" }] },
  { name: "Chandra, Torch of Defiance", category: "held-out planeswalker", text: "+1: Exile the top card of your library. You may cast that card.\n+1: Add {R}{R}.\n−3: Chandra deals 4 damage to target creature.\n−7: Chandra deals 10 damage to target player or planeswalker.", primitives: [{ actionType: "exile", evidenceContains: "Exile the top card" }, { actionType: "cast", evidenceContains: "cast that card" }, { actionType: "add_mana", evidenceContains: "Add {R}" }, { actionType: "deal_damage", evidenceContains: "deals 4 damage" }] },
  { name: "Narset, Parter of Veils", category: "held-out planeswalker", text: "+1: Each player draws a card.\n−2: Look at the top two cards of your library. Put one of them into your hand and the other into your graveyard.", primitives: [{ actionType: "draw", evidenceContains: "draws a card" }, { actionType: "mill", evidenceContains: "into your graveyard" }] },
  { name: "Kaya, Orzhov Usurper", category: "held-out planeswalker", text: "+1: Exile target nonland permanent an opponent controls with mana value 3 or less.\n−3: Exile target graveyard. If a card was exiled this way, you gain 1 life.\n−7: Target opponent loses half their life, rounded up.", primitives: [{ actionType: "exile", evidenceContains: "Exile target nonland" }, { actionType: "exile", evidenceContains: "Exile target graveyard" }, { actionType: "gain_life", evidenceContains: "gain 1 life" }] },
  { name: "Vraska, Golgari Queen", category: "held-out planeswalker", text: "+2: Put a +1/+1 counter on up to one target creature.\n−3: Destroy target creature with a +1/+1 counter on it.\n−10: Return target creature card from your graveyard to the battlefield.", primitives: [{ actionType: "put_counter", evidenceContains: "Put a +1/+1 counter" }, { actionType: "destroy", evidenceContains: "Destroy target creature" }, { actionType: "return_to_battlefield", evidenceContains: "from your graveyard to the battlefield" }] },

  // Optionality / up to
  { name: "Pongify", category: "held-out optionality", text: "Destroy target creature. Its controller creates a 3/3 green Ape creature token.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target creature" }, { actionType: "create_token", evidenceContains: "creates a 3/3" }] },
  { name: "Generous Gift", category: "held-out optionality", text: "Destroy target permanent. Its controller creates a 3/3 green Elephant creature token.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target permanent" }, { actionType: "create_token", evidenceContains: "creates a 3/3" }] },
  { name: "Void Snare", category: "held-out optionality", text: "Return target nonland permanent to its owner's hand.", primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target nonland permanent" }] },
  { name: "Brainstorm", category: "held-out optionality", text: "Draw three cards, then put two cards from your hand on top of your library in any order.", primitives: [{ actionType: "draw", evidenceContains: "Draw three cards" }] },
  { name: "Opt", category: "held-out optionality", text: "Scry 1.\nDraw a card.", primitives: [{ actionType: "scry", evidenceContains: "Scry 1" }, { actionType: "draw", evidenceContains: "Draw a card" }] },

  // Multiple abilities
  { name: "Thassa's Oracle", category: "held-out multi-ability", text: "When this creature enters, scry 1.\nWhen you cast this spell, look at the top X cards of your library, where X is the amount of mana spent to cast it. Put one of those cards into your hand and the rest on the bottom of your library in a random order.", primitives: [{ actionType: "scry", evidenceContains: "scry 1" }, { actionType: "draw", evidenceContains: "into your hand" }], structure: { minTriggeredAbilities: 2 } },
  { name: "Mulldrifter", category: "held-out multi-ability", text: "Flying\nWhen this creature enters, draw two cards.\nEvoke {2}{U}", primitives: [{ actionType: "draw", evidenceContains: "draw two cards" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Kitchen Finks", category: "held-out multi-ability", text: "When this creature enters, you gain 2 life.\nPersist", primitives: [{ actionType: "gain_life", evidenceContains: "gain 2 life" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Tireless Tracker", category: "held-out multi-ability", text: "Whenever a land you control enters, investigate.\nWhenever you sacrifice a Clue, put a +1/+1 counter on this creature.", primitives: [{ actionType: "put_counter", evidenceContains: "put a +1/+1 counter" }], structure: { minTriggeredAbilities: 2 } },
  { name: "Guardian Project", category: "held-out multi-ability", text: "Whenever a nontoken creature you control enters, if it doesn't have {ET}, draw a card.", primitives: [{ actionType: "draw", evidenceContains: "draw a card" }], structure: { minTriggeredAbilities: 1 } },

  // Trigger recall priority
  { name: "Panharmonicon", category: "held-out triggers", text: "If an ability would trigger an additional time, it triggers an additional time instead.", primitives: [], forbidden: ["draw"] },
  { name: "Strionic Resonator", category: "held-out triggers", text: "{2}, {T}: Copy target triggered ability you control. You may choose new targets for the copy.", primitives: [{ actionType: "copy", evidenceContains: "Copy target triggered" }] },
  { name: "Teysa Karlov", category: "held-out triggers", text: "If a creature dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.", primitives: [], forbidden: ["draw"] },
  { name: "Hissing Quag", category: "held-out triggers", text: "Land\nWhen this land enters, you gain 1 life.", primitives: [{ actionType: "gain_life", evidenceContains: "gain 1 life" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Bojuka Bog", category: "held-out triggers", text: "When this land enters, exile target player's graveyard.", primitives: [{ actionType: "exile", evidenceContains: "exile target player's graveyard" }], structure: { minTriggeredAbilities: 1 } },

  // Primitive coverage expansion
  { name: "Thoughtseize", category: "held-out primitives", text: "Target player reveals their hand. You choose a nonland card from it. That player discards that card.", primitives: [{ actionType: "discard", evidenceContains: "discards that card" }] },
  { name: "Inquisition of Kozilek", category: "held-out primitives", text: "Target player reveals their hand. You choose a nonland card from it with mana value 2 or less. That player discards that card.", primitives: [{ actionType: "discard", evidenceContains: "discards that card" }] },
  { name: "Mana Drain", category: "held-out primitives", text: "Counter target spell. At the beginning of your next main phase, add {C}{C}.", primitives: [{ actionType: "counter", evidenceContains: "Counter target spell" }, { actionType: "add_mana", evidenceContains: "Add {C}" }] },
  { name: "Nature's Claim", category: "held-out primitives", text: "Destroy target artifact or enchantment. Its controller gains 4 life.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target artifact" }, { actionType: "gain_life", evidenceContains: "gains 4 life" }] },
  { name: "Sign in Blood", category: "held-out primitives", text: "Target player draws two cards and loses 2 life.", primitives: [{ actionType: "draw", evidenceContains: "draws two cards" }, { actionType: "lose_life", evidenceContains: "loses 2 life" }] },
  { name: "Toxic Deluge", category: "held-out primitives", text: "As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.", primitives: [{ actionType: "lose_life", evidenceContains: "pay X life" }] },
  { name: "Cyclonic Rift", category: "held-out primitives", text: "Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U}", primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target nonland permanent" }] },
  { name: "Aether Vial", category: "held-out primitives", text: "At the beginning of your upkeep, you may put a creature card with mana value equal to the number of charge counters on this artifact from your hand onto the battlefield.", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your hand onto the battlefield" }], structure: { minTriggeredAbilities: 1, optional: true } },
  { name: "Crucible of Worlds", category: "held-out primitives", text: "You may play land cards from your graveyard.", primitives: [{ actionType: "play", evidenceContains: "play land cards from your graveyard" }] },
  { name: "Life from the Loam", category: "held-out primitives", text: "Return up to two target land cards from your graveyard to your hand.", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to your hand" }] },
  { name: "Entomb", category: "held-out primitives", text: "Search your library for a card, put that card into your graveyard, then shuffle.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }] },
  { name: "Buried Alive", category: "held-out primitives", text: "Search your library for up to three creature cards and put them into your graveyard. Then shuffle.", primitives: [{ actionType: "search_library", evidenceContains: "Search your library" }] },
  { name: "Regrowth", category: "held-out primitives", text: "Return target card from your graveyard to your hand.", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to your hand" }] },
  { name: "Reanimate", category: "held-out primitives", text: "Put target creature card from a graveyard onto the battlefield. You lose life equal to its mana value.", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from a graveyard onto the battlefield" }, { actionType: "lose_life", evidenceContains: "lose life" }] },
  { name: "Animate Dead", category: "held-out primitives", text: "Enchant creature\nWhen this Aura enters, if it's on the battlefield, it loses \"enchant creature.\" Return target creature card from your graveyard to the battlefield and attach this Aura to it.", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to the battlefield" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Wrath of God", category: "held-out primitives", text: "Destroy all creatures. They can't be regenerated.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy all creatures" }] },
  { name: "Damnation", category: "held-out primitives", text: "Destroy all creatures. They can't be regenerated.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy all creatures" }] },
  { name: "Supreme Verdict", category: "held-out primitives", text: "Destroy all creatures.\nThis spell can't be countered.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy all creatures" }] },
  { name: "Terminus", category: "held-out primitives", text: "Put all creatures on the bottom of their owners' libraries in any order.", primitives: [{ actionType: "shuffle_into_library", evidenceContains: "bottom of their owners' libraries" }] },
  { name: "Ashiok, Nightmare Muse", category: "held-out primitives", text: "+1: Return up to one target creature to its owner's hand.\n−3: Exile the top two cards of target opponent's library. Create a 2/2 blue Nightmare creature token with \"Whenever this creature attacks or blocks, each opponent exiles the top card of their library.\"", primitives: [{ actionType: "return_to_hand", evidenceContains: "Return up to one target creature" }, { actionType: "exile", evidenceContains: "Exile the top two cards" }, { actionType: "create_token", evidenceContains: "Create a 2/2" }] },

  // Negative / abstention cases
  { name: "Plains", category: "held-out negative", text: "({T}: Add {W}.)", primitives: [{ actionType: "add_mana", evidenceContains: "Add {W}" }], forbidden: ["draw", "destroy", "search_library"] },
  { name: "Sol Ring", category: "held-out negative", text: "{T}: Add {C}{C}.", primitives: [{ actionType: "add_mana", evidenceContains: "Add {C}" }], forbidden: ["draw", "destroy"] },
  { name: "Rhystic Study", category: "held-out negative", text: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.", primitives: [{ actionType: "draw", evidenceContains: "draw a card", optional: true }], structure: { minTriggeredAbilities: 1, optional: true } },
  { name: "Smothering Tithe", category: "held-out negative", text: "Whenever an opponent draws a card, that player may pay {2}. If they don't, you create a Treasure token.", primitives: [{ actionType: "create_token", evidenceContains: "Treasure token" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Drannith Magistrate", category: "held-out negative", text: "Your opponents can't cast spells from anywhere other than their hand.", primitives: [], forbidden: ["counter", "draw"] },

  // More layout diversity
  { name: "Claim // Fame", category: "held-out split/mdfc", layout: "split", text: "Return target creature card with mana value 2 or less from your graveyard to the battlefield.\n//\nTarget creature gets +2/+0 and gains haste until end of turn.", face: "back", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to the battlefield" }] },
  { name: "Consign // Oblivion", category: "held-out split/mdfc", layout: "split", text: "Put target nonland permanent into its owner's graveyard.\n//\nReturn target card from a graveyard to its owner's hand.", primitives: [{ actionType: "destroy", evidenceContains: "into its owner's graveyard" }, { actionType: "return_to_battlefield", evidenceContains: "from a graveyard to its owner's hand" }] },
  { name: "Never // Return", category: "held-out split/mdfc", layout: "split", text: "Destroy target creature or planeswalker.\n//\nReturn target creature card from your graveyard to the battlefield.", face: "back", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to the battlefield" }] },
  { name: "Rise // Fall", category: "held-out split/mdfc", layout: "split", text: "Return target creature card from your graveyard to the battlefield.\n//\nTarget player loses 2 life and you gain 2 life.", face: "back", primitives: [{ actionType: "return_to_battlefield", evidenceContains: "from your graveyard to the battlefield" }, { actionType: "lose_life", evidenceContains: "loses 2 life" }, { actionType: "gain_life", evidenceContains: "gain 2 life" }] },
  { name: "Bedeck // Bedazzle", category: "held-out split/mdfc", layout: "split", text: "Put a +1/+1 counter on target creature, then you may search your library and/or graveyard for a card named Ral, and put it onto the battlefield or into your hand.\n//\nDestroy target multicolored permanent.", face: "back", primitives: [{ actionType: "put_counter", evidenceContains: "Put a +1/+1 counter" }, { actionType: "search_library", evidenceContains: "search your library" }, { actionType: "destroy", evidenceContains: "Destroy target multicolored" }] },

  // Surveil / mill / tap
  { name: "Discovery // Dispersal", category: "held-out split/mdfc", layout: "split", text: "Surveil 2, then draw a card.\n//\nReturn target nonland permanent to its owner's hand.", face: "back", primitives: [{ actionType: "surveil", evidenceContains: "Surveil 2" }, { actionType: "draw", evidenceContains: "draw a card" }, { actionType: "return_to_hand", evidenceContains: "Return target nonland permanent" }] },
  { name: "Consider", category: "held-out primitives", text: "Look at the top card of your library. You may put that card into your graveyard.\nDraw a card.", primitives: [{ actionType: "draw", evidenceContains: "Draw a card" }] },
  { name: "Glimpse the Unthinkable", category: "held-out primitives", text: "Target player mills half their library, rounded down.", primitives: [{ actionType: "mill", evidenceContains: "mills half" }] },
  { name: "Fractured Sanity", category: "held-out primitives", text: "Each opponent mills fourteen cards.", primitives: [{ actionType: "mill", evidenceContains: "mills fourteen" }] },
  { name: "Cryptic Command", category: "held-out modal", text: "Choose two —\n• Counter target spell.\n• Return target permanent to its owner's hand.\n• Draw a card.\n• Tap all creatures your opponents control.", primitives: [{ actionType: "counter", evidenceContains: "Counter target spell" }, { actionType: "return_to_hand", evidenceContains: "Return target permanent" }, { actionType: "draw", evidenceContains: "Draw a card" }, { actionType: "tap", evidenceContains: "Tap all creatures" }] },

  // Copy vs cast
  { name: "Isochron Scepter", category: "held-out copy/cast", text: "Imprint — When this artifact enters, you may exile target instant or sorcery card with mana value 2 or less from your hand.\n{2}, {T}: You may copy the exiled card. If you do, you may cast the copy without paying its mana cost.", primitives: [{ actionType: "exile", evidenceContains: "exile target instant" }, { actionType: "copy", evidenceContains: "copy the exiled card" }, { actionType: "cast", evidenceContains: "cast the copy" }] },
  { name: "Mirrormade", category: "held-out copy/cast", text: "As this artifact enters or becomes the target of a spell, choose a nonland permanent token on the battlefield.", primitives: [], forbidden: ["draw"] },
  { name: "Ovinomancer", category: "held-out copy/cast", text: "{T}, Sacrifice this creature: Destroy target creature. It can't be regenerated.", primitives: [{ actionType: "sacrifice", evidenceContains: "Sacrifice this creature" }, { actionType: "destroy", evidenceContains: "Destroy target creature" }] },
  { name: "Kiki-Jiki, Mirror Breaker", category: "held-out copy/cast", text: "{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste.", primitives: [{ actionType: "copy", evidenceContains: "copy of target" }, { actionType: "create_token", evidenceContains: "Create a token" }] },
  { name: "Helm of the Host", category: "held-out copy/cast", text: "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except it isn't legendary.", primitives: [{ actionType: "copy", evidenceContains: "copy of equipped creature" }, { actionType: "create_token", evidenceContains: "create a token" }], structure: { minTriggeredAbilities: 1 } },

  // Room / dungeon
  { name: "Undercity Sewers", category: "held-out room", text: "({T}: Add {U} or {B}.)\nUnderground\nWhen you unlock a door of this Room, surveil 2.", primitives: [{ actionType: "add_mana", evidenceContains: "Add {U}" }, { actionType: "surveil", evidenceContains: "surveil 2" }], structure: { minTriggeredAbilities: 1 } },
  { name: "Hidden Nursery", category: "held-out room", text: "Whenever you unlock a door of this Room, create a 1/1 white and black Bat creature token with flying.", primitives: [{ actionType: "create_token", evidenceContains: "create a 1/1" }], structure: { minTriggeredAbilities: 1 } },

  // Class / prototype / mutate
  { name: "Wizard Class", category: "held-out class", text: "Class 1 — {U}: Level 2\nClass 2 — {U}{U}: Level 3\nLevel 3 — Whenever you cast an instant or sorcery spell, copy that spell. You may choose new targets for the copy.", primitives: [{ actionType: "copy", evidenceContains: "copy that spell" }] },
  { name: "Yorion, Sky Nomad", category: "held-out companion", text: "Companion — Your starting deck contains at least twenty cards more than the minimum deck size.\nFlying\nWhen Yorion enters, exile any number of other nonland permanents you control and/or nonland cards from your graveyard. When you do, for each card exiled this way, draw a card.", primitives: [{ actionType: "exile", evidenceContains: "exile any number" }, { actionType: "draw", evidenceContains: "draw a card" }], structure: { minTriggeredAbilities: 1 } },

  // Additional coverage to exceed 100
  { name: "Snap", category: "held-out extra", text: "Return target creature to its owner's hand. Untap up to two lands.", primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target creature" }] },
  { name: "Echoing Truth", category: "held-out extra", text: "Return target nonland permanent and all other permanents with the same name as that card to their owners' hands.", primitives: [{ actionType: "return_to_hand", evidenceContains: "Return target nonland permanent" }] },
  { name: "Ghost Quarter", category: "held-out extra", text: "{T}: Add {C}.\n{T}, Sacrifice this land: Destroy target land.", primitives: [{ actionType: "add_mana", evidenceContains: "Add {C}" }, { actionType: "sacrifice", evidenceContains: "Sacrifice this land" }, { actionType: "destroy", evidenceContains: "Destroy target land" }] },
  { name: "Strip Mine", category: "held-out extra", text: "{T}: Add {C}.\n{T}, Sacrifice this land: Destroy target land.", primitives: [{ actionType: "add_mana", evidenceContains: "Add {C}" }, { actionType: "destroy", evidenceContains: "Destroy target land" }] },
  { name: "Wasteland", category: "held-out extra", text: "{T}: Add {C}.\n{T}, Sacrifice this land: Destroy target nonbasic land.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target nonbasic land" }] },
  { name: "Field of Ruin", category: "held-out extra", text: "{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Destroy target nonbasic land an opponent controls. That land's controller searches their library for a basic land card, puts it onto the battlefield, then shuffles.", primitives: [{ actionType: "destroy", evidenceContains: "Destroy target nonbasic land" }, { actionType: "search_library", evidenceContains: "searches their library" }] },
  { name: "Fierce Guardianship", category: "held-out extra", text: "If you control a commander, you may cast this spell without paying its mana cost.\nCounter target noncreature spell.", primitives: [{ actionType: "counter", evidenceContains: "Counter target noncreature" }] },
  { name: "Deflecting Swat", category: "held-out extra", text: "If you control a commander, you may cast this spell without paying its mana cost.\nYou may choose new targets for target spell or ability.", primitives: [{ actionType: "counter", evidenceContains: "target spell" }], forbidden: ["draw"] },
  { name: "Deadly Rollick", category: "held-out extra", text: "If you control a commander, you may cast this spell without paying its mana cost.\nExile target creature.", primitives: [{ actionType: "exile", evidenceContains: "Exile target creature" }] },
  { name: "Ad Nauseam", category: "held-out extra", text: "Reveal the top card of your library and put that card into your hand. You lose life equal to its mana value. You may repeat this process any number of times.", primitives: [{ actionType: "draw", evidenceContains: "into your hand" }, { actionType: "lose_life", evidenceContains: "lose life" }] },
];

function buildHeldOutCases(): OracleActionEvalCaseV2[] {
  return HELD_OUT_SEEDS.map((seed, idx) => {
    const id = `held-${String(idx + 1).padStart(4, "0")}`;
    const primitives = seed.primitives.map((p) => ({
      actionType: p.actionType,
      evidenceContains: p.evidenceContains,
      cardFace: seed.face,
      optional: p.optional,
    }));
    const roles = inferDerivedRoles(primitives.map((p) => p.actionType));
    return {
      id,
      category: seed.category,
      layout: seed.layout,
      oracleId: `held-oracle-${idx + 1}`,
      oracleText: seed.text,
      cardFace: seed.face,
      expectedStructure: seed.structure,
      expectedPrimitiveActions: primitives,
      expectedRoles: roles.length
        ? roles.map((role) => ({
            role,
            fromPrimitiveActions: primitives
              .map((p) => p.actionType)
              .filter((p) =>
                role === "tutor"
                  ? p === "search_library"
                  : role === "ramp"
                    ? p === "add_mana"
                    : role === "removal"
                      ? ["destroy", "exile", "deal_damage", "counter"].includes(p)
                      : role === "card_advantage"
                        ? p === "draw"
                        : role === "recursion"
                          ? ["play", "cast", "return_to_battlefield"].includes(p)
                          : false,
              ),
          }))
        : undefined,
      forbiddenPrimitiveActions: seed.forbidden,
    };
  });
}

function main() {
  const cases = buildHeldOutCases();
  const contentHash = computeContentHash(cases);

  const payload = {
    evaluationVersion: EVALUATION_VERSION,
    setType: "held-out-test",
    contentHash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: cases.length,
    frozenAt: new Date().toISOString(),
    usagePolicy: "never used to create parser rules — production gates must pass here",
    categoryCounts: Object.fromEntries(
      [...new Set(cases.map((c) => c.category))].map((cat) => [
        cat,
        cases.filter((c) => c.category === cat).length,
      ]),
    ),
    cases,
  };

  const outPath = resolve(process.cwd(), "data", "oracle-action-eval-held-out.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(`Generated ${cases.length} held-out cases → ${outPath}`);
  console.log(`  contentHash: ${contentHash}`);
}

main();
