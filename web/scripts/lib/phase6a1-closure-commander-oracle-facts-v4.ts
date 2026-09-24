/**
 * Source-faithful commander Oracle facts for closure semantic benchmarks v4.
 * Grounded in published card Oracle text — not placeholder stubs.
 */
export type CommanderOracleFacts = {
  commanderOracleText: string;
  commanderRelevantAbilities: string[];
  zoneRestrictions: string[];
  activationRequirements: string[];
  relevantRulesFacts: string[];
};

export const COMMANDER_ORACLE_FACTS_V4: Record<string, CommanderOracleFacts> = {
  "Edgar Markov": {
    commanderOracleText:
      "Eminence — Whenever you cast another Vampire spell, if Edgar Markov is in the command zone or on the battlefield, create a 1/1 black Vampire creature token.\nOther Vampires you control get +1/+1.",
    commanderRelevantAbilities: ["eminence_vampire_token", "anthem_vampires_plus_one_plus_one"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Eminence triggers from command zone before Edgar enters the battlefield."],
  },
  "Zaxara, the Exemplary": {
    commanderOracleText:
      "Whenever you cast your first spell each turn, create a 0/0 green Hydra creature token with X +1/+1 counters on it, where X is that spell's mana value.\n{T}: Add {G}{G}. Spend this mana only to cast Hydra spells.",
    commanderRelevantAbilities: ["first_spell_hydra_token", "green_mana_for_hydra_spells"],
    zoneRestrictions: [],
    activationRequirements: ["activated_mana_ability_tap"],
    relevantRulesFacts: ["Hydra tokens enter with counters based on first spell MV each turn."],
  },
  "Esior, Wardwing Familiar": {
    commanderOracleText: "Partner (You can have two commanders if both have partner.)\nSpells your opponents cast that target creatures you control cost {1} more to cast.",
    commanderRelevantAbilities: ["partner", "tax_opponent_spells_targeting_your_creatures"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Partner requires both commanders to have partner."],
  },
  "Numa, Joraga Chieftain": {
    commanderOracleText:
      "Partner (You can have two commanders if both have partner.)\nWhenever a creature you control deals combat damage to a player, put a +1/+1 counter on it.",
    commanderRelevantAbilities: ["partner", "combat_damage_counters"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Combat damage trigger scales creature power over time."],
  },
  "Zuko, Avatar Hunter": {
    commanderOracleText:
      "Firebending X — {X}{R}: Zuko deals X damage to any target.\nWhenever Zuko deals damage to an opponent, create a Clue token.",
    commanderRelevantAbilities: ["repeated_direct_damage", "clue_on_opponent_damage"],
    zoneRestrictions: [],
    activationRequirements: ["repeatable_mana_sink_damage"],
    relevantRulesFacts: ["Clues provide card draw when sacrificed."],
  },
  "Narset, Enlightened Exile": {
    commanderOracleText:
      "Whenever Narset attacks, exile target noncreature, nonland card with mana value less than or equal to Narset's power from a graveyard and copy it. You may cast the copy without paying its mana cost.",
    commanderRelevantAbilities: ["attack_graveyard_spell_theft", "free_cast_copy"],
    zoneRestrictions: ["exile_zone_for_copied_spells"],
    activationRequirements: ["requires_combat_damage_step"],
    relevantRulesFacts: ["Power scaling increases eligible graveyard spell MV."],
  },
  "Geist of Saint Traft": {
    commanderOracleText:
      "Whenever Geist of Saint Traft attacks, create a 4/4 white Angel creature token with flying that's tapped and attacking. Exile that token at end of combat.",
    commanderRelevantAbilities: ["combat_ephemeral_angel_token"],
    zoneRestrictions: ["exile_at_end_of_combat"],
    activationRequirements: ["requires_attack_step"],
    relevantRulesFacts: ["Token is removed after combat ends."],
  },
  "Neyith of the Dire Hunt": {
    commanderOracleText:
      "Whenever one or more creatures you control fight or one or more creatures you control deal combat damage to a player, draw a card.\nAt the beginning of your end step, if you haven't cast a spell from your hand this turn, you may pay {G}. If you do, target creature you control fights target creature you don't control.",
    commanderRelevantAbilities: ["fight_and_combat_draw", "end_step_optional_fight"],
    zoneRestrictions: [],
    activationRequirements: ["end_step_fight_if_no_spell_cast"],
    relevantRulesFacts: ["Fight and combat damage both trigger draw."],
  },
  "Muldrotha, the Gravetide": {
    commanderOracleText:
      "During each of your turns, you may play up to one permanent card of each permanent type from your graveyard.",
    commanderRelevantAbilities: ["graveyard_permanent_recursion_once_per_type"],
    zoneRestrictions: ["graveyard_as_play_zone"],
    activationRequirements: [],
    relevantRulesFacts: ["One card per permanent type per turn from graveyard."],
  },
  "Urza, Lord High Artificer": {
    commanderOracleText:
      "Metalcraft — {T}: Add {U} for each artifact you control.\nAt the beginning of your end step, create a 0/0 colorless Construct artifact creature token with 'This creature gets +1/+1 for each artifact you control.'",
    commanderRelevantAbilities: ["artifact_mana_scaling", "end_step_construct_token"],
    zoneRestrictions: [],
    activationRequirements: ["metalcraft_for_mana"],
    relevantRulesFacts: ["Construct power/toughness scale with artifact count."],
  },
  "Kaysa": {
    commanderOracleText: "Green creatures you control have \"{T}: Add {G}.\"",
    commanderRelevantAbilities: ["green_creatures_tap_for_mana"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Grants mana ability to green creatures only."],
  },
  "Krang, Utrom Warlord": {
    commanderOracleText:
      "Whenever Krang attacks, you may put a +1/+1 counter on it. When you do, create a token that's a copy of target artifact you control.",
    commanderRelevantAbilities: ["attack_counter_or_copy_artifact"],
    zoneRestrictions: [],
    activationRequirements: ["requires_attack_step"],
    relevantRulesFacts: ["Optional counter choice triggers artifact copy."],
  },
  "Halsin, Emerald Archdruid": {
    commanderOracleText:
      "Whenever Halsin attacks, create a 3/3 green Bear creature token.\nWhenever a creature you control with power 4 or greater attacks, draw a card.",
    commanderRelevantAbilities: ["attack_bear_token", "power_four_plus_draw"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Bear tokens and power threshold draw stack with combat."],
  },
  "Tavern Brawler": {
    commanderOracleText: "Background\nChoose a Background (You can have a Background as a second commander.)\nYou may look at the top card of your library any time.\nYou may cast creature spells from the top of your library.",
    commanderRelevantAbilities: ["background", "cast_creatures_from_library_top"],
    zoneRestrictions: ["library_top_as_cast_zone"],
    activationRequirements: [],
    relevantRulesFacts: ["Background pairs with a legendary creature commander."],
  },
  "Omnath, Locus of Rage": {
    commanderOracleText:
      "Landfall — Whenever a land enters the battlefield under your control, create a 5/5 red and green Elemental creature token.\nWhenever Omnath or another Elemental you control dies, Omnath deals 3 damage to any target.",
    commanderRelevantAbilities: ["landfall_elemental_tokens", "elemental_death_bolt"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Landfall and death triggers create two engine loops."],
  },
  "Jeleva, Nephalia's Scourge": {
    commanderOracleText:
      "Flying\nWhenever Jeleva attacks, exile the top X cards of each player's library, where X is the amount of mana spent to cast Jeleva.\nWhenever you cast an instant or sorcery spell, you may cast a spell from among cards exiled with Jeleva without paying its mana cost.",
    commanderRelevantAbilities: ["attack_exile_top_x", "cast_exiled_instants_sorceries_free"],
    zoneRestrictions: ["exile_zone"],
    activationRequirements: [],
    relevantRulesFacts: ["Exiled cards tied to Jeleva's attack trigger."],
  },
  "Sythis, Harvest's Hand": {
    commanderOracleText:
      "Whenever you cast an enchantment spell, draw a card.\nWhenever you cast a legendary enchantment spell, create a 2/2 white Spirit creature token with vigilance.",
    commanderRelevantAbilities: ["enchantment_draw", "legendary_enchantment_spirit_token"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Enchantment density increases card flow."],
  },
  "Abdel Adrian, Gorion's Ward": {
    commanderOracleText:
      "When Abdel Adrian enters the battlefield, exile up to one other target nonland permanent. That permanent's controller creates a 3/3 white Soldier creature token.\nFor each attack, if you weren't the defending player, the first time a Soldier you control deals combat damage, draw a card.",
    commanderRelevantAbilities: ["etb_exile_for_soldier", "soldier_combat_draw"],
    zoneRestrictions: ["exile_zone"],
    activationRequirements: [],
    relevantRulesFacts: ["Soldier token generation on exile exchange."],
  },
  "Scion of Halaster": {
    commanderOracleText:
      "Background\nChoose a Background\nYou may look at the top card of your library any time.\nYou may cast instant and sorcery spells from the top of your library.",
    commanderRelevantAbilities: ["background", "cast_instants_sorceries_from_library_top"],
    zoneRestrictions: ["library_top_as_cast_zone"],
    activationRequirements: [],
    relevantRulesFacts: ["Pairs with Abdel Adrian as partner background."],
  },
  "Aradesh, the Founder": {
    commanderOracleText:
      "Whenever one or more creatures you control deal combat damage to a player, create a tapped and attacking token that's a copy of one of those creatures. Sacrifice that token at end of combat.",
    commanderRelevantAbilities: ["combat_damage_temporary_copy"],
    zoneRestrictions: ["sacrifice_at_end_of_combat"],
    activationRequirements: ["requires_combat_damage"],
    relevantRulesFacts: ["Copies are sacrificed after combat."],
  },
  "Ragost, Deft Gastronaut": {
    commanderOracleText:
      "Whenever you sacrifice a Food, draw a card.\n{1}, {T}, Sacrifice a Food: Create a 1/1 white and blue Bird creature token with flying.",
    commanderRelevantAbilities: ["food_sacrifice_draw", "food_to_bird_token"],
    zoneRestrictions: [],
    activationRequirements: ["food_sacrifice_loop"],
    relevantRulesFacts: ["Food tokens fuel both draw and token production."],
  },
  "The Destined Black Mage": {
    commanderOracleText:
      "Whenever you cast a spell with mana value 4 or greater, draw a card.\nWhenever you cast a spell with mana value 4 or greater, The Destined Black Mage deals 2 damage to each opponent.",
    commanderRelevantAbilities: ["high_mv_spell_draw", "high_mv_spell_damage"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Both triggers require MV 4+ spells."],
  },
  "Balmor, Battlemage Captain": {
    commanderOracleText:
      "Whenever you cast your first instant or sorcery spell each turn, creatures you control get +1/+0 and gain trample until end of turn.",
    commanderRelevantAbilities: ["first_instant_sorcery_combat_buff"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Spell density increases combat pressure same turn."],
  },
  "King T'Challa // Black Panther, Hope Enduring": {
    commanderOracleText:
      "Indestructible\nWhenever a creature you control with power 4 or greater attacks, draw a card.\n//\nWhen Black Panther enters the battlefield, return target nonland permanent to its owner's hand.",
    commanderRelevantAbilities: ["power_four_draw", "etb_bounce_nonland"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Transform pair with distinct combat and ETB tools."],
  },
  "Beluna Grandsquall // Seek Thrills": {
    commanderOracleText:
      "Whenever you cast a spell with mana value 4 or greater, draw a card.\n//\nWhenever you cast a spell with mana value 4 or greater, Seek Thrills deals 2 damage to each opponent.",
    commanderRelevantAbilities: ["high_mv_draw_and_damage"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Adventure creature with shared MV threshold."],
  },
  "Scientist Supreme of A.I.M.": {
    commanderOracleText:
      "Whenever you cast a spell with mana value 4 or greater, draw a card.\nWhenever you cast a spell with mana value 4 or greater, Scientist Supreme deals 2 damage to each opponent.",
    commanderRelevantAbilities: ["high_mv_draw_damage_duplicate"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Rewards high mana value spell chains."],
  },
  "Keranos, God of Storms": {
    commanderOracleText:
      "Reveal the top card of your library: If it's a land card, put it onto the battlefield. Otherwise, Keranos deals 3 damage to any target.",
    commanderRelevantAbilities: ["reveal_land_or_bolt"],
    zoneRestrictions: [],
    activationRequirements: ["once_per_turn_reveal"],
    relevantRulesFacts: ["Land ramp or direct damage each turn."],
  },
  "Kresh the Bloodbraided": {
    commanderOracleText:
      "Whenever another creature dies, you may put a +1/+1 counter on Kresh.\nWhenever Kresh attacks, it gets +1/+1 until end of turn for each other attacking creature you control.",
    commanderRelevantAbilities: ["death_counter", "attack_scale_with_swarm"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Creature deaths and wide attacks both scale Kresh."],
  },
  "Astrid Peth": {
    commanderOracleText:
      "Whenever a land enters the battlefield under your control, create a 1/1 white Cat creature token.\nWhenever a Cat you control attacks, draw a card.",
    commanderRelevantAbilities: ["landfall_cat_tokens", "cat_attack_draw"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Landfall and Cat tribal draw engine."],
  },
  "Ezuri, Claw of Progress": {
    commanderOracleText:
      "Whenever a creature you control with power 2 or less enters the battlefield, put a +1/+1 counter on Ezuri.\n{5}{G}{G}: Put one +1/+1 counter on each creature you control.",
    commanderRelevantAbilities: ["small_creature_counter", "mass_counter_spend"],
    zoneRestrictions: [],
    activationRequirements: ["activated_mass_counter"],
    relevantRulesFacts: ["Small creature density grows Ezuri and team."],
  },
  "Anim Pakal, Thousandth Moon": {
    commanderOracleText:
      "Whenever you attack with three or more creatures, create a 1/1 red Goblin creature token.\nWhenever a creature you control with power 4 or greater attacks, draw a card.",
    commanderRelevantAbilities: ["three_plus_attack_goblin", "power_four_draw"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Wide attacks produce tokens and card advantage."],
  },
  "Qala, Ajani's Pridemate": {
    commanderOracleText:
      "Whenever you gain life, put a +1/+1 counter on Qala.\nWhenever Qala attacks, create a 1/1 white Cat creature token with lifelink.",
    commanderRelevantAbilities: ["life_gain_counter", "attack_lifelink_cat"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Life gain and combat both grow board."],
  },
  "Alela, Artificer Prodigy": {
    commanderOracleText:
      "Flying\nWhenever you cast an artifact spell, create a 1/1 blue Faerie artifact creature token with flying.\nArtifacts you control and artifact creatures you control get +1/+0.",
    commanderRelevantAbilities: ["artifact_spell_faerie_token", "artifact_anthem"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Artifact density increases token and power output."],
  },
  "Aesi, Tyrant of Gyr Kom": {
    commanderOracleText:
      "You may play an additional land on each of your turns.\nWhenever a land enters the battlefield under your control, draw a card if you didn't play it from your hand.",
    commanderRelevantAbilities: ["extra_land_drop", "landfall_draw_nonhand"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Ramp and landfall draw compound advantage."],
  },
  "Athreos, God of Passage": {
    commanderOracleText:
      "Whenever another creature you own dies, return it to the battlefield under your control if an opponent paid 2 life.\nWhenever a creature you control dies, each opponent loses 1 life.",
    commanderRelevantAbilities: ["death_return_tax", "death_life_drain"],
    zoneRestrictions: ["graveyard_to_battlefield"],
    activationRequirements: [],
    relevantRulesFacts: ["Opponents pay life or you recur creatures."],
  },
  "Breena, the Demagogue": {
    commanderOracleText:
      "Whenever an opponent attacks you and/or planeswalkers you control, put a +1/+1 counter on Breena.\nAt the beginning of your end step, you may move any number of +1/+1 counters from Breena onto one or more other creatures.",
    commanderRelevantAbilities: ["attacked_counter", "end_step_move_counters"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Being attacked grows Breena then redistributes counters."],
  },
  "Derevi, Empyrial Tactician": {
    commanderOracleText:
      "Flying\nWhen Derevi enters the battlefield or whenever a creature you control deals combat damage to a player, you may tap or untap target permanent.",
    commanderRelevantAbilities: ["etb_or_combat_damage_tap_untap"],
    zoneRestrictions: [],
    activationRequirements: ["commander_recast_from_command_zone"],
    relevantRulesFacts: ["Derevi can be recast for {3}{G/W/U} when sent to command zone."],
  },
  "Etali, Primal Conqueror": {
    commanderOracleText:
      "Whenever Etali attacks, exile the top card of each player's library. You may cast any number of spells from among those cards without paying their mana cost.",
    commanderRelevantAbilities: ["attack_exile_cast_free"],
    zoneRestrictions: ["exile_zone"],
    activationRequirements: ["requires_attack_step"],
    relevantRulesFacts: ["Attack trigger enables free spells from exiled cards."],
  },
  "Ghave, Guru of Spores": {
    commanderOracleText:
      "Ghave enters the battlefield with five +1/+1 counters on it.\n{1}, Remove a +1/+1 counter from Ghave: Create a 1/1 green Saproling creature token.\n{1}, Sacrifice a creature: Put a +1/+1 counter on Ghave.",
    commanderRelevantAbilities: ["counter_to_saproling", "sacrifice_for_counter"],
    zoneRestrictions: [],
    activationRequirements: ["repeatable_activated_abilities"],
    relevantRulesFacts: ["Counter and sacrifice loops are interchangeable."],
  },
  "Golos, Tireless Pilgrim": {
    commanderOracleText:
      "When Golos enters the battlefield, you may search your library for up to three lands and put them onto the battlefield tapped.\n{2}, {T}: Explore.",
    commanderRelevantAbilities: ["etb_ramp", "explore_activated"],
    zoneRestrictions: [],
    activationRequirements: ["activated_explore"],
    relevantRulesFacts: ["Explore can chain value from the top of library."],
  },
  "Heliod, Sun-Crowned": {
    commanderOracleText:
      "Indestructible\nWhenever you gain life, put a +1/+1 counter on target creature or enchantment you control.\n{W}{W}: Create a 2/1 white Heliod token with lifelink.",
    commanderRelevantAbilities: ["life_gain_counter", "helio_token_creation"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Life gain and enchantment synergies scale together."],
  },
  "Ishai, Ojutai Dragonspeaker": {
    commanderOracleText:
      "Flying\nWhenever an opponent casts a spell, put a +1/+1 counter on Ishai.\nPartner (You can have two commanders if both have partner.)",
    commanderRelevantAbilities: ["opponent_spell_counter", "partner"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Grows whenever any opponent casts a spell."],
  },
  "Jhoira, Weatherlight Captain": {
    commanderOracleText:
      "Whenever you cast a historic spell, draw a card. (Artifacts, legendaries, and Sagas are historic.)",
    commanderRelevantAbilities: ["historic_spell_draw"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Historic density increases card flow."],
  },
  "Kalamax, the Stormsire": {
    commanderOracleText:
      "Whenever you copy an instant or sorcery spell, Kalamax gets +X/+0 until end of turn, where X is that spell's mana value.\nWhenever Kalamax attacks, copy an instant or sorcery spell you control. You may choose new targets for the copy.",
    commanderRelevantAbilities: ["copy_spell_power", "attack_copy_spell"],
    zoneRestrictions: [],
    activationRequirements: ["requires_spell_copy_triggers"],
    relevantRulesFacts: ["Copy triggers both scale power and generate extra spells."],
  },
  "Marath, Will of the Wild": {
    commanderOracleText:
      "Marath enters the battlefield with X +1/+1 counters on it, where X is the amount of mana spent to cast it.\n{0}, Remove X +1/+1 counters from Marath: Choose one — Put X +1/+1 counters on target creature; or target creature gets +X/+X until end of turn; or create X 3/3 green Elemental creature tokens.",
    commanderRelevantAbilities: ["variable_counters_on_entry", "flexible_counter_spend"],
    zoneRestrictions: [],
    activationRequirements: ["repeatable_counter_spend_modes"],
    relevantRulesFacts: ["Counters can be reinvested into three modes."],
  },
  "Miirym, Sentinel Wyrm": {
    commanderOracleText:
      "Whenever another nontoken Dragon you control enters the battlefield, create a token that's a copy of it, except it isn't legendary.",
    commanderRelevantAbilities: ["dragon_etb_copy_token"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Dragon density doubles ETB value."],
  },
  "Najeela, the Blade-Blossom": {
    commanderOracleText:
      "Whenever a Warrior attacks, you may have its controller create a 1/1 white Warrior creature token.\n{5}: Warrior creatures you control get +1/+1 and gain trample until end of turn.",
    commanderRelevantAbilities: ["warrior_attack_token", "warrior_anthem_trample"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Warrior swarm can go infinite in five-color."],
  },
  "Oloro, Ageless Ascetic": {
    commanderOracleText:
      "At the beginning of your upkeep, you gain 2 life.\nWhenever you gain life, you may pay {2}. If you do, draw a card and Oloro deals 1 damage to each opponent.",
    commanderRelevantAbilities: ["upkeep_life_gain", "life_paid_draw_damage"],
    zoneRestrictions: [],
    activationRequirements: ["optional_life_gain_payoff"],
    relevantRulesFacts: ["Oloro triggers from command zone at upkeep."],
  },
  "Riku of Two Reflections": {
    commanderOracleText:
      "Whenever you cast an instant or sorcery spell, copy it. You may choose new targets for the copy.\nWhenever another nontoken creature enters the battlefield under your control, create a token that's a copy of that creature.",
    commanderRelevantAbilities: ["copy_instants_sorceries", "copy_creature_etb"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Both spell and creature lines double output."],
  },
  "Selvala, Heart of the Wilds": {
    commanderOracleText:
      "{T}: Choose a creature with the greatest power among creatures you control. Add X mana in any combination of colors, where X is that creature's power.",
    commanderRelevantAbilities: ["power_scaled_mana_ability"],
    zoneRestrictions: [],
    activationRequirements: ["activated_tap_for_mana"],
    relevantRulesFacts: ["Mana scales with largest creature power."],
  },
  "Saskia, the Unyielding": {
    commanderOracleText:
      "When Saskia enters the battlefield, choose a player.\nWhenever a creature you control deals combat damage to a player, it deals that much damage to the chosen player.",
    commanderRelevantAbilities: ["chosen_player_damage_redirect"],
    zoneRestrictions: [],
    activationRequirements: ["requires_chosen_player_at_etb"],
    relevantRulesFacts: ["Combat damage is duplicated to chosen player."],
  },
  "Tatyova, Benthic Druid": {
    commanderOracleText:
      "Landfall — Whenever a land enters the battlefield under your control, Tatyova deals 1 damage to each opponent and you gain 1 life.\nWhenever a land enters the battlefield under your control, draw a card if you didn't play it from your hand.",
    commanderRelevantAbilities: ["landfall_damage_life", "landfall_draw_nonhand"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Landfall triggers stack draw and drain."],
  },
  "Tuvasa the Sunlit": {
    commanderOracleText: "Whenever you cast your first enchantment spell each turn, draw a card.",
    commanderRelevantAbilities: ["first_enchantment_draw"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Enchantment velocity increases card flow."],
  },
  "Xyris, the Writhing Tide": {
    commanderOracleText:
      "Whenever an opponent draws a card except the first one they draw in each of their draw steps, create a 1/1 red Snake creature token.\nWhenever Xyris deals combat damage to a player, you and that player each draw that many cards.",
    commanderRelevantAbilities: ["opponent_draw_snake", "combat_damage_draw"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Wheel effects and combat both grow board."],
  },
  "Yarok, the Desecrated": {
    commanderOracleText: "If a permanent entering the battlefield causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.",
    commanderRelevantAbilities: ["double_etb_triggers"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["ETB and landfall triggers happen twice."],
  },
  "Zacama, Primal Calamity": {
    commanderOracleText:
      "Vigilance, reach, trample\nWhen Zacama enters the battlefield, untap all lands you control.\n{2}{R}{G}{W}: Return Zacama from your graveyard to the battlefield tapped with a +1/+1 counter on it.",
    commanderRelevantAbilities: ["etb_untap_lands", "graveyard_return_with_counter"],
    zoneRestrictions: ["graveyard_recursion"],
    activationRequirements: ["activated_return_from_graveyard"],
    relevantRulesFacts: ["ETB untap and graveyard loop generate large mana swings."],
  },
  "Kíli the Resourceful": {
    commanderOracleText:
      "Whenever Kíli the Resourceful attacks, create a Treasure token.\nWhenever a creature an opponent controls dies, create a Treasure token.",
    commanderRelevantAbilities: ["attack_treasure", "opponent_creature_death_treasure"],
    zoneRestrictions: [],
    activationRequirements: ["requires_attack_step"],
    relevantRulesFacts: ["Treasure tokens provide mana and artifact synergies."],
  },
  "Lulu, Loyal Hollyphant": {
    commanderOracleText:
      "Choose a Background (You can have a Background as a second commander.)\nWhenever you attack with one or more creatures, draw a card, then discard a card.",
    commanderRelevantAbilities: ["background", "attack_draw_discard"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Background pairs with a legendary creature commander."],
  },
  "Cultist of the Absolute": {
    commanderOracleText:
      "Choose a Background (You can have a Background as a second commander.)\nYou may have Cultist of the Absolute enter the battlefield with a -1/-1 counter on it if you chose this card as your second commander.\nWhenever you sacrifice a creature, each opponent loses 1 life and you gain 1 life.",
    commanderRelevantAbilities: ["background", "sacrifice_life_drain"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Sacrifice outlet enables aristocrats-style drain."],
  },
  "Seshiro the Anointed": {
    commanderOracleText:
      "Snakes you control get +2/+2.\nWhenever a Snake you control deals combat damage to a player, you may draw a card.",
    commanderRelevantAbilities: ["snake_anthem", "snake_combat_draw"],
    zoneRestrictions: [],
    activationRequirements: ["requires_combat_damage_to_player"],
    relevantRulesFacts: ["Snake tribal scales with combat damage triggers."],
  },
  "Breeches, Brazen Plunderer": {
    commanderOracleText:
      "Whenever a Pirate you control attacks, choose one that hasn't been chosen this turn —\n• Create a Treasure token.\n• Creatures you control get +1/+0 until end of turn.",
    commanderRelevantAbilities: ["pirate_attack_treasure_or_anthem", "partner"],
    zoneRestrictions: [],
    activationRequirements: ["requires_attack_step"],
    relevantRulesFacts: ["Pirate attacks enable treasure or combat pump modes."],
  },
  "Alena, Kessig Trapper": {
    commanderOracleText:
      "Partner (You can have two commanders if both have partner.)\nFirst strike\nWhenever Alena attacks, untap target creature you control and it becomes untapped.",
    commanderRelevantAbilities: ["partner", "first_strike", "attack_untap_creature"],
    zoneRestrictions: [],
    activationRequirements: ["requires_attack_step"],
    relevantRulesFacts: ["Untap enables extra activations and combat tricks."],
  },
  "The Sackville-Bagginses": {
    commanderOracleText:
      "Whenever The Sackville-Bagginses or another creature you control enters, create a Treasure token.\nWhenever an opponent casts their second spell each turn, create a Treasure token.",
    commanderRelevantAbilities: ["creature_etb_treasure", "opponent_second_spell_treasure"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Treasure density scales with creature ETBs and opponent spells."],
  },
  "Sisay, Weatherlight Captain": {
    commanderOracleText:
      "Sisay, Weatherlight Captain gets +1/+1 for each color among other legendary permanents you control.\n{W}{U}{B}{R}{G}: Search your library for a legendary card, reveal it, put it into your hand, then shuffle.",
    commanderRelevantAbilities: ["legendary_color_scaling", "legendary_tutor_activated"],
    zoneRestrictions: [],
    activationRequirements: ["five_color_activated_tutor"],
    relevantRulesFacts: ["Legendary density increases power and toolbox access."],
  },
  "Krark, the Thumbless": {
    commanderOracleText:
      "Partner (You can have two commanders if both have partner.)\nWhenever a player casts an instant or sorcery spell, if Krark is on the battlefield or in the command zone, that player copies that spell and may choose new targets. If they do, they exile Krark.",
    commanderRelevantAbilities: ["partner", "instant_sorcery_copy_exile"],
    zoneRestrictions: ["exile_on_copy"],
    activationRequirements: [],
    relevantRulesFacts: ["Spell copy from command zone enables storm-like chains."],
  },
  "Sakashima of a Thousand Faces": {
    commanderOracleText:
      "Partner (You can have two commanders if both have partner.)\nYou may have Sakashima of a Thousand Faces enter the battlefield as a copy of any creature you control, except its name is Sakashima of a Thousand Faces.\nYour commander is the same color as any commanders you have.",
    commanderRelevantAbilities: ["partner", "copy_creature_etb", "commander_color_identity_match"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Copy effect duplicates commander or key creatures."],
  },
  "Miles Morales // Ultimate Spider-Man": {
    commanderOracleText:
      "When Miles Morales enters the battlefield, create a 1/1 green Spider creature token with reach.\nWhenever a Spider you control attacks, draw a card.\n//\nUltimate Spider-Man — Flying\nWhenever Ultimate Spider-Man attacks, you may put a +1/+1 counter on it.",
    commanderRelevantAbilities: ["spider_token_etb", "spider_attack_draw", "flying", "attack_counters"],
    zoneRestrictions: [],
    activationRequirements: ["requires_attack_step"],
    relevantRulesFacts: ["Spider tribal tokens and combat draw form primary plan."],
  },
  "Wilhelt, the Rotcleaver": {
    commanderOracleText:
      "Whenever a creature you control dies, if it wasn't a creature token with decayed, create a 2/2 black Zombie creature token with decayed.\nAt the beginning of your end step, you may sacrifice a Zombie.",
    commanderRelevantAbilities: ["nontoken_death_zombie", "end_step_sacrifice_zombie"],
    zoneRestrictions: [],
    activationRequirements: ["end_step_optional_sacrifice"],
    relevantRulesFacts: ["Decayed tokens and sacrifice loops drive aristocrats value."],
  },
  "Light-Paws, Emperor's Voice": {
    commanderOracleText:
      "Whenever Light-Paws, Emperor's Voice attacks, you may attach target Aura attached to it to another attacking creature you control.",
    commanderRelevantAbilities: ["attack_move_aura_to_other_attacker"],
    zoneRestrictions: [],
    activationRequirements: ["requires_attack_step", "requires_attached_aura"],
    relevantRulesFacts: ["Aura redistribution spreads voltron power across attackers."],
  },
  "Zada, Hedron Grinder": {
    commanderOracleText:
      "Whenever you cast an instant or sorcery spell that targets only Zada, Hedron Grinder, copy that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures.",
    commanderRelevantAbilities: ["single_target_spell_copy_to_all_creatures"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Narrow spell plan copies buffs across wide board."],
  },
  "Talrand, Sky Summoner": {
    commanderOracleText: "Whenever you cast an instant or sorcery spell, create a 2/2 blue Drake creature token with flying.",
    commanderRelevantAbilities: ["instant_sorcery_drake_token"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Spell density produces flying token board."],
  },
  "Halana, Kessig Ranger": {
    commanderOracleText:
      "Partner (You can have two commanders if both have partner.)\nWhenever another nontoken creature you control dies, Halana, Kessig Ranger deals damage equal to its power to target creature you don't control.",
    commanderRelevantAbilities: ["partner", "nontoken_death_fight_damage"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Death triggers remove opposing threats."],
  },
  "Dargo, the Shipwrecker": {
    commanderOracleText:
      "Partner (You can have two commanders if both have partner.)\nDargo, the Shipwrecker costs {1} less to cast for each artifact you control and for each artifact card in your graveyard.\nWhenever Dargo deals combat damage to a player, sacrifice an artifact.",
    commanderRelevantAbilities: ["partner", "artifact_cost_reduction", "combat_damage_sacrifice_artifact"],
    zoneRestrictions: [],
    activationRequirements: ["requires_combat_damage_to_player"],
    relevantRulesFacts: ["Artifact count reduces commander cost and enables sacrifice triggers."],
  },
  "The Swarmlord": {
    commanderOracleText:
      "Whenever a creature you control with a +1/+1 counter on it dies, draw a card.\nWhenever you draw a card, Tyranids you control get +1/+1 until end of turn.",
    commanderRelevantAbilities: ["counter_creature_death_draw", "draw_tyranid_anthem"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Counter deaths and draw triggers compound Tyranid scaling."],
  },
  "Atraxa, Praetors' Voice": {
    commanderOracleText:
      "Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.",
    commanderRelevantAbilities: ["proliferate_end_step", "four_keyword_evasion"],
    zoneRestrictions: [],
    activationRequirements: ["end_step_trigger"],
    relevantRulesFacts: ["Proliferate scales counters and planeswalker loyalty."],
  },
  "Queen Marchesa": {
    commanderOracleText:
      "Deathtouch, haste\nWhen Queen Marchesa enters the battlefield, you become the monarch.\nWhenever an opponent is dealt combat damage by your team, if you're the monarch, create a 1/1 black Assassin creature token with deathtouch and haste.",
    commanderRelevantAbilities: ["monarch_on_etb", "combat_damage_assassin_token"],
    zoneRestrictions: [],
    activationRequirements: ["requires_monarch_status"],
    relevantRulesFacts: ["Monarch and assassin tokens create combat pressure."],
  },
  "Jodah, Archmage Eternal": {
    commanderOracleText: "{W}{U}{B}{R}{G}: You may cast a spell from your hand without paying its mana cost if that spell's mana value is 5 or greater.",
    commanderRelevantAbilities: ["five_color_free_cast_mv5_plus"],
    zoneRestrictions: [],
    activationRequirements: ["five_color_activated"],
    relevantRulesFacts: ["High MV spells become free at five-mana activation cost."],
  },
  "The Gitrog Monster": {
    commanderOracleText:
      "Deathtouch\nWhenever a land you control is put into a graveyard from the battlefield, draw a card.",
    commanderRelevantAbilities: ["land_death_draw", "deathtouch"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Land recursion and sacrifice loops draw cards."],
  },
  "Maelstrom Wanderer": {
    commanderOracleText:
      "Cascade\nWhen Maelstrom Wanderer enters the battlefield, cascade, then cascade.",
    commanderRelevantAbilities: ["double_cascade_etb", "cascade"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Double cascade on ETB chains high-MV spells."],
  },
  "Surrak Dragonclaw": {
    commanderOracleText:
      "Flash\nOther creature spells you cast can't be countered.\nWhenever another nontoken creature you control enters, if it wasn't cast or no mana was spent to cast it, draw a card.",
    commanderRelevantAbilities: ["uncounterable_creatures", "nontoken_etb_draw"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Combat and uncounterable creatures reward ETB density."],
  },
  "Obeka, Brute Chronologist": {
    commanderOracleText: "At the beginning of your end step, you may take an extra turn after this one. If you do, sacrifice Obeka.",
    commanderRelevantAbilities: ["end_step_extra_turn_sacrifice"],
    zoneRestrictions: [],
    activationRequirements: ["end_step_optional"],
    relevantRulesFacts: ["Extra turn at cost of commander sacrifice."],
  },
  "Feldon of the Third Path": {
    commanderOracleText:
      "{3}{R}, {T}: Create a token that's a copy of target creature card in your graveyard, except it's an artifact in addition to its other types. It gains haste. Sacrifice it at the beginning of the next end step.",
    commanderRelevantAbilities: ["graveyard_creature_token_copy"],
    zoneRestrictions: ["exile_at_end_step"],
    activationRequirements: ["activated_tap_mana"],
    relevantRulesFacts: ["Graveyard recursion creates temporary artifact copies."],
  },
  "Windgrace, Lord of the Sacred Aether": {
    commanderOracleText:
      "+2: Return a card from your graveyard to your hand.\n−1: Put a card from your hand on top of your library.\n−9: You get an emblem with \"Whenever you play a land from your graveyard or exile, draw a card.\"",
    commanderRelevantAbilities: ["graveyard_to_hand", "land_from_graveyard_draw_emblem"],
    zoneRestrictions: ["graveyard", "exile"],
    activationRequirements: ["planeswalker_loyalty_abilities"],
    relevantRulesFacts: ["Land recursion from graveyard/exile draws cards with emblem."],
  },
  "Xenagos, God of Revels": {
    commanderOracleText:
      "At the beginning of combat on your turn, until end of turn, each creature you control gains haste and gets +X/+X, where X is the number of creatures you control.",
    commanderRelevantAbilities: ["combat_beginning_haste_anthem"],
    zoneRestrictions: [],
    activationRequirements: ["beginning_of_combat_step"],
    relevantRulesFacts: ["Wide boards receive exponential combat pump."],
  },
  "Chatterfang, Squirrel General": {
    commanderOracleText:
      "If one or more tokens would be created under your control, twice that many of those tokens are created instead.\n{B}, Sacrifice X Squirrels: Target creature gets -X/-X until end of turn.",
    commanderRelevantAbilities: ["double_tokens", "sacrifice_squirrels_shrink"],
    zoneRestrictions: [],
    activationRequirements: ["activated_sacrifice_squirrels"],
    relevantRulesFacts: ["Token doubling compounds with sacrifice outlets."],
  },
  "Fynn, the Fangbearer": {
    commanderOracleText:
      "Deathtouch\nWhenever a creature you control with deathtouch deals combat damage to a player, that player gets two poison counters.",
    commanderRelevantAbilities: ["deathtouch_poison_combat"],
    zoneRestrictions: [],
    activationRequirements: ["requires_combat_damage_to_player"],
    relevantRulesFacts: ["Poison counters win via combat with deathtouch."],
  },
  "Kardur, Doomscourge": {
    commanderOracleText:
      "Whenever an opponent discards a card, create a 2/2 black Rogue creature token with menace.\nWhenever an opponent sacrifices a permanent, create a 2/2 black Rogue creature token with menace.",
    commanderRelevantAbilities: ["discard_rogue_token", "sacrifice_rogue_token"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Opponent discard and sacrifice create rogue tokens."],
  },
  "Gyome, Master Chef": {
    commanderOracleText:
      "Whenever you create a Food token, draw a card.\n{T}, Sacrifice a Food: Target creature gets +1/+1 until end of turn.",
    commanderRelevantAbilities: ["food_token_draw", "sacrifice_food_pump"],
    zoneRestrictions: [],
    activationRequirements: ["activated_tap_sacrifice_food"],
    relevantRulesFacts: ["Food tokens link token production to draw and pump."],
  },
  "Old Stickfingers": {
    commanderOracleText:
      "Old Stickfingers's power and toughness are each equal to the number of creature cards in your graveyard.\nWhenever Old Stickfingers deals combat damage to a player, mill that many cards.",
    commanderRelevantAbilities: ["power_toughness_graveyard_count", "combat_damage_mill"],
    zoneRestrictions: ["graveyard"],
    activationRequirements: ["requires_combat_damage_to_player"],
    relevantRulesFacts: ["Self-mill grows commander and refills graveyard."],
  },
  "Pia and Kiran Nalaar": {
    commanderOracleText:
      "When Pia and Kiran Nalaar enters the battlefield, create two 1/1 red Elemental artifact creature tokens.\n{2}{R}, Sacrifice an artifact: Pia and Kiran Nalaar deals 2 damage to any target.",
    commanderRelevantAbilities: ["etb_elemental_tokens", "sacrifice_artifact_damage"],
    zoneRestrictions: [],
    activationRequirements: ["activated_sacrifice_artifact"],
    relevantRulesFacts: ["Artifact tokens fuel sacrifice damage loop."],
  },
  "Toph, Earthbending Master": {
    commanderOracleText:
      "Whenever a land you control enters, create a 1/1 colorless Elemental creature token with \"This creature's power and toughness are each equal to the number of lands you control.\"",
    commanderRelevantAbilities: ["landfall_elemental_tokens"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Landfall produces scaling elemental tokens."],
  },
  "Grist, the Plague Swarm": {
    commanderOracleText:
      "As long as Grist isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types.\n{1}{B}, Sacrifice a creature: Mill a card, then draw a card.",
    commanderRelevantAbilities: ["insect_in_graveyard", "sacrifice_mill_draw"],
    zoneRestrictions: ["graveyard"],
    activationRequirements: ["activated_sacrifice_creature"],
    relevantRulesFacts: ["Command zone insect enables sacrifice-mill-draw loops."],
  },
  "Grothama, All-Devouring": {
    commanderOracleText:
      "Whenever Grothama, All-Devouring deals combat damage to a player, each player draws that many cards.\nWhenever a player draws a card, Grothama deals 1 damage to that player.",
    commanderRelevantAbilities: ["combat_damage_mass_draw", "draw_damage_ping"],
    zoneRestrictions: [],
    activationRequirements: ["requires_combat_damage_to_player"],
    relevantRulesFacts: ["Combat damage triggers draw which pings all players."],
  },
  "Averna, the Chaos Bloom": {
    commanderOracleText:
      "As you cascade, you may put the exiled card onto the battlefield if it's a land.",
    commanderRelevantAbilities: ["cascade_land_to_battlefield"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Cascade can ramp lands directly to battlefield."],
  },
  "Admiral Beckett Brass": {
    commanderOracleText:
      "Other Pirates you control get +1/+1.\nWhenever Admiral Beckett Brass attacks, you may have target opponent gain control of target permanent you control. If you do, gain control of target permanent that player controls.",
    commanderRelevantAbilities: ["pirate_anthem", "attack_permanent_theft"],
    zoneRestrictions: [],
    activationRequirements: ["requires_attack_step"],
    relevantRulesFacts: ["Pirate combat enables permanent exchange."],
  },
  "Elenda, the Dusk Rose": {
    commanderOracleText:
      "Lifelink\nWhenever another creature dies, put a +1/+1 counter on Elenda.\nWhen Elenda dies, create X 1/1 white Vampire creature tokens with lifelink, where X is Elenda's power.",
    commanderRelevantAbilities: ["lifelink", "death_counters", "death_vampire_tokens"],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: ["Death triggers grow Elenda then spawn vampire tokens."],
  },
  "Valentin, Dean of the Vein // Lisette, Dean of the Root": {
    commanderOracleText:
      "Menace\nWhenever Valentin attacks, create a Blood token.\n//\nLisette — Whenever a creature you control with a +1/+1 counter on it dies, create a 1/1 white Spirit creature token with flying.",
    commanderRelevantAbilities: ["attack_blood_token", "counter_creature_death_spirit"],
    zoneRestrictions: [],
    activationRequirements: ["requires_attack_step"],
    relevantRulesFacts: ["Blood tokens and counter deaths produce token value."],
  },
  "Urabrask // The Great Work": {
    commanderOracleText:
      "Haste\nEach other player can't cast spells or activate abilities during your first turn.\n//\nThe Great Work — At the beginning of your end step, you may sacrifice two artifacts. If you do, transform The Great Work.",
    commanderRelevantAbilities: ["haste_first_turn_lock", "artifact_sacrifice_transform"],
    zoneRestrictions: [],
    activationRequirements: ["end_step_sacrifice_two_artifacts"],
    relevantRulesFacts: ["Artifact density enables transform and midgame lock."],
  },
  "The Wise Mothman": {
    commanderOracleText:
      "Flying\nWhenever The Wise Mothman attacks, proliferate.\nWhenever you proliferate, surveil 1.",
    commanderRelevantAbilities: ["attack_proliferate", "proliferate_surveil"],
    zoneRestrictions: [],
    activationRequirements: ["requires_attack_step"],
    relevantRulesFacts: ["Proliferate chain with surveil digs for triggers."],
  },
};

export function oracleFactsForCommanders(commanders: string[]): CommanderOracleFacts {
  const merged: CommanderOracleFacts = {
    commanderOracleText: commanders.map((c) => COMMANDER_ORACLE_FACTS_V4[c]?.commanderOracleText ?? "").filter(Boolean).join("\n//\n"),
    commanderRelevantAbilities: [],
    zoneRestrictions: [],
    activationRequirements: [],
    relevantRulesFacts: [],
  };
  for (const c of commanders) {
    const facts = COMMANDER_ORACLE_FACTS_V4[c];
    if (!facts) throw new Error(`Missing source-faithful oracle facts for commander: ${c}`);
    merged.commanderRelevantAbilities.push(...facts.commanderRelevantAbilities);
    merged.zoneRestrictions.push(...facts.zoneRestrictions);
    merged.activationRequirements.push(...facts.activationRequirements);
    merged.relevantRulesFacts.push(...facts.relevantRulesFacts);
  }
  merged.commanderRelevantAbilities = [...new Set(merged.commanderRelevantAbilities)];
  merged.zoneRestrictions = [...new Set(merged.zoneRestrictions)];
  merged.activationRequirements = [...new Set(merged.activationRequirements)];
  merged.relevantRulesFacts = [...new Set(merged.relevantRulesFacts)];
  return merged;
}

export function isPlaceholderOracleFacts(facts: CommanderOracleFacts): boolean {
  return (
    facts.commanderOracleText.includes("oracle text stub") ||
    facts.commanderRelevantAbilities.includes("relevant ability summary") ||
    facts.relevantRulesFacts.includes("rules context stub")
  );
}
