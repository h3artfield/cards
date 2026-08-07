/**
 * Manual adjudication of v1.13 accepted gold_omission FPs against catalog Oracle text.
 * Run: npx tsx scripts/adjudicate-gold-omission-v18.ts
 */
export const GOLD_OMISSION_REVIEWER = "gold-omission-audit-v18";
export const GOLD_OMISSION_REVIEWED_AT = "2026-08-07T07:30:00.000Z";

export type GoldOmissionDecision = "add_gold" | "reject_parser_output";

export interface GoldOmissionAdjudication {
  caseId: string;
  cardName: string;
  oracleId?: string;
  face: "front" | "back";
  exactOracleText: string;
  parserPrimitive: string;
  parserEvidence: string;
  layer1Structure: string;
  decision: GoldOmissionDecision;
  reason: string;
  reviewer: string;
  reviewedAt: string;
  goldAddition?: {
    actionType: string;
    evidenceContains: string;
    cardFace?: "front" | "back";
    optionalEffect?: boolean;
  };
  goldRemoval?: {
    actionType: string;
    evidenceContains: string;
  };
  forbiddenPrimitive?: string;
}

/** All 36 accepted gold_omission entries from v13-error-audit-v17.json — manually verified. */
export const GOLD_OMISSION_ADJUDICATIONS: GoldOmissionAdjudication[] = [
  {
    caseId: "dev-cond-003",
    cardName: "Onakke Oathkeeper",
    face: "front",
    exactOracleText:
      "Creatures can't attack planeswalkers you control unless their controller pays {1} for each creature they control that's attacking a planeswalker you control.\n{4}{W}{W}, Exile this card from your graveyard: Return target planeswalker card from your graveyard to the battlefield.",
    parserPrimitive: "return_to_battlefield",
    parserEvidence: "Return target planeswalker card from your graveyard to the battlefield",
    layer1Structure: "static restriction + activated GY ability",
    decision: "add_gold",
    reason: "Activated effect return from graveyard is a distinct Layer-2 primitive alongside static restriction.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: {
      actionType: "return_to_battlefield",
      evidenceContains: "Return target planeswalker card from your graveyard to the battlefield",
    },
  },
  {
    caseId: "dev-opt-004",
    cardName: "Snuff Out",
    face: "front",
    exactOracleText:
      "If you control a Swamp, you may pay 4 life rather than pay this spell's mana cost.\nDestroy target nonblack creature. It can't be regenerated.",
    parserPrimitive: "destroy",
    parserEvidence: "Destroy target nonblack creature",
    layer1Structure: "alternative cost + spell effect",
    decision: "add_gold",
    reason: "Primary spell resolution destroy is Layer-2; alternative cost is Layer-1.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "destroy", evidenceContains: "Destroy target nonblack creature" },
  },
  {
    caseId: "dev-v9-004",
    cardName: "Elvish Reclaimer",
    face: "front",
    exactOracleText:
      "This creature gets +2/+2 as long as there are three or more land cards in your graveyard.\n{2}, {T}, Sacrifice a land: Search your library for a land card, put it onto the battlefield tapped, then shuffle.",
    parserPrimitive: "search_library",
    parserEvidence: "Search your library for",
    layer1Structure: "static + activated",
    decision: "add_gold",
    reason: "Search is a separate primitive from put_onto_battlefield in the activated resolution.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "search_library", evidenceContains: "Search your library for a land card" },
  },
  {
    caseId: "dev-v9-013",
    cardName: "Underworld Breach",
    face: "front",
    exactOracleText:
      "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard. (You may cast cards from your graveyard for their escape cost.)\nAt the beginning of the end step, sacrifice this enchantment.",
    parserPrimitive: "sacrifice",
    parserEvidence: "sacrifice this enchantment",
    layer1Structure: "static escape grant + end-step triggered sacrifice",
    decision: "add_gold",
    reason: "End-step sacrifice is Layer-2; remove erroneous cast gold from escape reminder parenthetical.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "sacrifice", evidenceContains: "sacrifice this enchantment" },
    goldRemoval: {
      actionType: "cast",
      evidenceContains: "graveyard. (You may cast cards from your graveyard for their escape cos",
    },
    forbiddenPrimitive: "cast",
  },
  {
    caseId: "dev-v9-027",
    cardName: "Harmonic Sliver",
    face: "front",
    exactOracleText: 'All Slivers have "When this permanent enters, destroy target artifact or enchantment."',
    parserPrimitive: "destroy",
    parserEvidence: "destroy target artifact or enchantment",
    layer1Structure: "static grant with quoted triggered destroy",
    decision: "add_gold",
    reason: "Quoted grant text is this card's oracle action — ETB destroy is Layer-2 gold.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: {
      actionType: "destroy",
      evidenceContains: "destroy target artifact or enchantment",
    },
  },
  {
    caseId: "eval-0047",
    cardName: "Curious Obsession",
    face: "front",
    exactOracleText:
      'Enchant creature\nEnchanted creature gets +1/+1 and has "Whenever this creature deals combat damage to a player, you may draw a card."\nAt the beginning of your end step, if you didn\'t attack with a creature this turn, sacrifice this Aura.',
    parserPrimitive: "sacrifice",
    parserEvidence: "sacrifice this Aura",
    layer1Structure: "aura with granted draw + end-step sacrifice trigger",
    decision: "add_gold",
    reason: "End-step conditional sacrifice is distinct from granted draw ability.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "sacrifice", evidenceContains: "sacrifice this Aura" },
  },
  {
    caseId: "eval-0052",
    cardName: "Hostile Hostel // Creeping Inn",
    face: "front",
    exactOracleText:
      "{T}: Add {C}.\n{1}, {T}, Sacrifice a creature: Put a soul counter on this land. Then if there are three or more soul counters on it, remove those counters, transform it, then untap it. Activate only as a sorcery.",
    parserPrimitive: "untap",
    parserEvidence: "untap it",
    layer1Structure: "activated transform sequence",
    decision: "add_gold",
    reason: "Untap after transform is part of the activated effect resolution on front face.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "untap", evidenceContains: "untap it", cardFace: "front" },
  },
  {
    caseId: "eval-0055",
    cardName: "Oko, the Ringleader",
    face: "front",
    exactOracleText:
      "At the beginning of combat on your turn, Oko becomes a copy of up to one target creature you control until end of turn, except he has hexproof.\n+1: Draw two cards. If you've committed a crime this turn, discard a card. Otherwise, discard two cards.",
    parserPrimitive: "discard",
    parserEvidence: "discard two cards",
    layer1Structure: "planeswalker +1 with conditional discard branches",
    decision: "add_gold",
    reason: "Both discard branches on +1 are Layer-2 primitives complementary to draw.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "discard", evidenceContains: "discard a card" },
  },
  {
    caseId: "eval-0058",
    cardName: "Grief",
    face: "front",
    exactOracleText:
      "Menace\nWhen this creature enters, target opponent reveals their hand. You choose a nonland card from it. That player discards that card.\nEvoke—Exile a black card from your hand.",
    parserPrimitive: "discard",
    parserEvidence: "discards that card",
    layer1Structure: "ETB discard + evoke cost",
    decision: "add_gold",
    reason: "ETB forced discard is Layer-2; evoke exile is separate gold.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "discard", evidenceContains: "discards that card" },
  },
  {
    caseId: "eval-0063",
    cardName: "Underworld Breach",
    face: "front",
    exactOracleText:
      "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard. (You may cast cards from your graveyard for their escape cost.)\nAt the beginning of the end step, sacrifice this enchantment.",
    parserPrimitive: "sacrifice",
    parserEvidence: "sacrifice this enchantment",
    layer1Structure: "static escape grant + end-step triggered sacrifice",
    decision: "add_gold",
    reason: "Duplicate eval case for Underworld Breach — add end-step sacrifice; escape cast is Layer-1 only.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "sacrifice", evidenceContains: "sacrifice this enchantment" },
    forbiddenPrimitive: "cast",
  },
  {
    caseId: "eval-0102",
    cardName: "Gilraen, Dúnedain Protector",
    face: "front",
    exactOracleText:
      "{2}, {T}: Exile another target creature you control. You may return that card to the battlefield under its owner's control. If you don't, at the beginning of the next end step, return that card to the battlefield under its owner's control with a vigilance counter and a lifelink counter on it.",
    parserPrimitive: "return_to_hand",
    parserEvidence: "You may return that card to the battlefield under its owner",
    layer1Structure: "activated exile/return with delayed trigger",
    decision: "add_gold",
    reason: "Parser mislabeled zone — gold uses return_to_battlefield for optional immediate return.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: {
      actionType: "return_to_battlefield",
      evidenceContains: "return that card to the battlefield",
      optionalEffect: true,
    },
  },
  {
    caseId: "eval-0116",
    cardName: "Nova Hellkite",
    face: "front",
    exactOracleText:
      "Flying, haste\nWhen this creature enters, it deals 1 damage to target creature an opponent controls.\nWarp {2}{R} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)",
    parserPrimitive: "deal_damage",
    parserEvidence: "deals 1 damage to target creature an opponent controls",
    layer1Structure: "ETB damage + warp reminder",
    decision: "add_gold",
    reason: "ETB damage is Layer-2; warp reminder is Layer-1.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: {
      actionType: "deal_damage",
      evidenceContains: "deals 1 damage to target creature an opponent controls",
    },
  },
  {
    caseId: "eval-0118",
    cardName: "Glissa, the Traitor",
    face: "front",
    exactOracleText:
      "First strike, deathtouch\nWhenever a creature an opponent controls dies, you may return target artifact card from your graveyard to your hand.",
    parserPrimitive: "return_to_hand",
    parserEvidence: "you may return target artifact card from your graveyard to your hand",
    layer1Structure: "triggered optional return",
    decision: "add_gold",
    reason: "Triggered graveyard-to-hand return is Layer-2.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: {
      actionType: "return_to_hand",
      evidenceContains: "return target artifact card from your graveyard to your hand",
      optionalEffect: true,
    },
  },
  {
    caseId: "eval-0131",
    cardName: "Dawnbringer Cleric",
    face: "front",
    exactOracleText:
      "When this creature enters, choose one —\n• Cure Wounds — You gain 2 life.\n• Dispel Magic — Destroy target enchantment.\n• Gentle Repose — Exile target card from a graveyard.",
    parserPrimitive: "gain_life",
    parserEvidence: "gain 2 life",
    layer1Structure: "modal ETB",
    decision: "add_gold",
    reason: "Cure Wounds modal bullet gain_life missing from gold.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "gain_life", evidenceContains: "gain 2 life" },
  },
  {
    caseId: "eval-0140",
    cardName: "Azorius Guildmage",
    face: "front",
    exactOracleText: "{2}{W}: Tap target creature.\n{2}{U}: Counter target activated ability. (Mana abilities can't be targeted.)",
    parserPrimitive: "tap",
    parserEvidence: "Tap target creature",
    layer1Structure: "dual activated abilities",
    decision: "add_gold",
    reason: "First activated tap ability missing from gold (counter on second ability only).",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "tap", evidenceContains: "Tap target creature" },
  },
  {
    caseId: "eval-0142",
    cardName: "Demonic Pact",
    face: "front",
    exactOracleText:
      "At the beginning of your upkeep, choose one that hasn't been chosen —\n• This enchantment deals 4 damage to any target and you gain 4 life.\n• Target opponent discards two cards.\n• Draw two cards.\n• You lose the game.",
    parserPrimitive: "deal_damage",
    parserEvidence: "deals 4 damage to any target",
    layer1Structure: "modal upkeep",
    decision: "add_gold",
    reason: "First modal bullet deal_damage missing from gold.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "deal_damage", evidenceContains: "deals 4 damage to any target" },
  },
  {
    caseId: "eval-0142",
    cardName: "Demonic Pact",
    face: "front",
    exactOracleText:
      "At the beginning of your upkeep, choose one that hasn't been chosen —\n• This enchantment deals 4 damage to any target and you gain 4 life.\n• Target opponent discards two cards.\n• Draw two cards.\n• You lose the game.",
    parserPrimitive: "gain_life",
    parserEvidence: "gain 4 life",
    layer1Structure: "modal upkeep",
    decision: "add_gold",
    reason: "First modal bullet gain_life missing from gold.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "gain_life", evidenceContains: "gain 4 life" },
  },
  {
    caseId: "eval-0145",
    cardName: "Greta, Sweettooth Scourge",
    face: "front",
    exactOracleText:
      'When Greta enters, create a Food token. (It\'s an artifact with "{2}, {T}, Sacrifice this token: You gain 3 life.")\n{G}, Sacrifice a Food: Put a +1/+1 counter on target creature. Activate only as a sorcery.\n{1}{B}, Sacrifice a Food: You draw a card and you lose 1 life.',
    parserPrimitive: "lose_life",
    parserEvidence: "lose 1 life",
    layer1Structure: "ETB token + two Food activated abilities",
    decision: "add_gold",
    reason: "Black Food activation lose_life paired with draw — missing from gold.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "lose_life", evidenceContains: "lose 1 life" },
  },
  {
    caseId: "eval-0147",
    cardName: "Deadly Visit",
    face: "front",
    exactOracleText:
      "Destroy target creature.\nSurveil 2. (Look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)",
    parserPrimitive: "destroy",
    parserEvidence: "Destroy target creature",
    layer1Structure: "spell destroy + surveil",
    decision: "add_gold",
    reason: "Primary destroy effect missing; surveil gold present.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "destroy", evidenceContains: "Destroy target creature" },
  },
  {
    caseId: "eval-0150",
    cardName: "Rashmi, Eternities Crafter",
    face: "front",
    exactOracleText:
      "Whenever you cast your first spell each turn, reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser mana value. If you don't cast it, put it into your hand.",
    parserPrimitive: "cast",
    parserEvidence: "cast it",
    layer1Structure: "triggered reveal + optional cast permission",
    decision: "reject_parser_output",
    reason: "Optional cast-without-paying within triggered ability is Layer-1 permission structure, not imperative cast primitive.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    forbiddenPrimitive: "cast",
  },
  {
    caseId: "eval-0153",
    cardName: "Sauron, the Lidless Eye",
    face: "front",
    exactOracleText:
      "When Sauron enters, gain control of target creature an opponent controls until end of turn. Untap it. It gains haste until end of turn.\n{1}{B}{R}: Creatures you control get +2/+0 until end of turn. Each opponent loses 2 life.",
    parserPrimitive: "untap",
    parserEvidence: "Untap it",
    layer1Structure: "ETB steal + activated pump",
    decision: "add_gold",
    reason: "Untap on ETB resolution is Layer-2 alongside lose_life on activated ability.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "untap", evidenceContains: "Untap it" },
  },
  {
    caseId: "eval-0154",
    cardName: "Death Frenzy",
    face: "front",
    exactOracleText: "All creatures get -2/-2 until end of turn. Whenever a creature dies this turn, you gain 1 life.",
    parserPrimitive: "gain_life",
    parserEvidence: "gain 1 life",
    layer1Structure: "global effect + death trigger",
    decision: "add_gold",
    reason: "Death-triggered gain life is Layer-2.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "gain_life", evidenceContains: "gain 1 life" },
  },
  {
    caseId: "eval-0158",
    cardName: "Tibalt, Rakish Instigator",
    face: "front",
    exactOracleText:
      'Your opponents can\'t gain life.\n−2: Create a 1/1 red Devil creature token with "When this token dies, it deals 1 damage to any target."',
    parserPrimitive: "deal_damage",
    parserEvidence: "deals 1 damage to any target",
    layer1Structure: "static restriction + token creation with quoted death trigger",
    decision: "reject_parser_output",
    reason: "Deal damage is inside quoted token reminder text — not this card's Layer-2 action; create_token gold is correct.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    forbiddenPrimitive: "deal_damage",
  },
  {
    caseId: "eval-0163",
    cardName: "Nyssa of Traken",
    face: "front",
    exactOracleText:
      "You have no maximum hand size.\nSonic Booster — Whenever Nyssa of Traken attacks, sacrifice any number of artifacts. When you sacrifice one or more artifacts this way, tap up to that many target creatures and draw that many cards.",
    parserPrimitive: "sacrifice",
    parserEvidence: "sacrifice one or more artifacts this way",
    layer1Structure: "attack trigger with reflexive when-clause",
    decision: "reject_parser_output",
    reason: "Parser extracted reflexive trigger antecedent ('this way'), not the imperative sacrifice effect.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
  },
  {
    caseId: "eval-0192",
    cardName: "Nevermind",
    face: "front",
    exactOracleText:
      "(Spells without mana costs can't be played)\nWhen this spell resolves, discard a card. Then draw a card.\nSplice onto Anything {1}{R} (As you cast a spell, you may reveal this card from your hand and pay its splice cost. If you do, add this card's effect to that spell.)",
    parserPrimitive: "discard",
    parserEvidence: "discard a card",
    layer1Structure: "spell resolution discard/draw + splice reminder",
    decision: "add_gold",
    reason: "Resolve discard is Layer-2 paired with draw gold.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "discard", evidenceContains: "discard a card" },
  },
  {
    caseId: "eval-0195",
    cardName: "Convalescence",
    face: "front",
    exactOracleText: "At the beginning of your upkeep, if you have 10 or less life, you gain 1 life.",
    parserPrimitive: "gain_life",
    parserEvidence: "gain 1 life",
    layer1Structure: "conditional upkeep trigger",
    decision: "add_gold",
    reason: "Conditional upkeep gain life is Layer-2.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "gain_life", evidenceContains: "gain 1 life" },
  },
  {
    caseId: "eval-0201",
    cardName: "Pollywog Symbiote",
    face: "front",
    exactOracleText:
      "Each creature spell you cast costs {1} less to cast if it has mutate.\nWhenever you cast a creature spell, if it has mutate, draw a card, then discard a card.",
    parserPrimitive: "discard",
    parserEvidence: "discard a card",
    layer1Structure: "static cost reduction + mutate trigger",
    decision: "add_gold",
    reason: "Mutate trigger discard paired with draw is Layer-2.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "discard", evidenceContains: "discard a card" },
  },
  {
    caseId: "eval-0203",
    cardName: "Sorcerer Class",
    face: "front",
    exactOracleText:
      'When this Class enters, draw two cards, then discard two cards.\nCreatures you control have "{T}: Add {U} or {R}. Spend this mana only to cast an instant or sorcery spell or to gain a Class level."',
    parserPrimitive: "discard",
    parserEvidence: "discard two cards",
    layer1Structure: "class ETB + level-2 static grant",
    decision: "add_gold",
    reason: "ETB discard two cards is Layer-2 alongside draw gold.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "discard", evidenceContains: "discard two cards" },
  },
  {
    caseId: "eval-0203",
    cardName: "Sorcerer Class",
    face: "front",
    exactOracleText:
      'When this Class enters, draw two cards, then discard two cards.\nCreatures you control have "{T}: Add {U} or {R}. Spend this mana only to cast an instant or sorcery spell or to gain a Class level."',
    parserPrimitive: "cast",
    parserEvidence: "cast this ",
    layer1Structure: "class ETB + level-2 static grant",
    decision: "reject_parser_output",
    reason: "'Spend this mana only to cast' inside quoted grant is static permission — not Layer-2 cast.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    forbiddenPrimitive: "cast",
  },
  {
    caseId: "eval-0204",
    cardName: "Stormchaser's Talent",
    face: "front",
    exactOracleText:
      "When this Class becomes level 2, return target instant or sorcery card from your graveyard to your hand.",
    parserPrimitive: "return_to_hand",
    parserEvidence: "return target instant or sorcery card from your graveyard to your hand",
    layer1Structure: "class level-2 trigger",
    decision: "add_gold",
    reason: "Level-2 graveyard return is Layer-2 complementary to token gold.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: {
      actionType: "return_to_hand",
      evidenceContains: "return target instant or sorcery card from your graveyard to your hand",
    },
  },
  {
    caseId: "eval-0266",
    cardName: "Suspicious Stowaway // Seafaring Werewolf",
    face: "front",
    exactOracleText:
      "Whenever this creature deals combat damage to a player, draw a card, then discard a card.",
    parserPrimitive: "discard",
    parserEvidence: "discard a card",
    layer1Structure: "daybound front-face combat trigger",
    decision: "add_gold",
    reason: "Front-face combat damage discard paired with draw — back face lacks discard.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "discard", evidenceContains: "discard a card", cardFace: "front" },
  },
  {
    caseId: "eval-0267",
    cardName: "Steel Sabotage",
    face: "front",
    exactOracleText: "Choose one —\n• Counter target artifact spell.\n• Return target artifact to its owner's hand.",
    parserPrimitive: "return_to_hand",
    parserEvidence: "Return target artifact to its owner's hand",
    layer1Structure: "modal spell",
    decision: "add_gold",
    reason: "Second modal bullet return_to_hand missing; fix counter evidence span.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: {
      actionType: "return_to_hand",
      evidenceContains: "Return target artifact to its owner's hand",
    },
  },
  {
    caseId: "eval-0270",
    cardName: "Overwhelmed Archivist // Archive Haunt",
    face: "back",
    exactOracleText:
      "When this creature enters, draw a card, then discard a card.\nWhenever this creature attacks, draw a card, then discard a card.",
    parserPrimitive: "discard",
    parserEvidence: "discard a card",
    layer1Structure: "back-face ETB + attack triggers",
    decision: "add_gold",
    reason: "Back-face discard paired with draw on both triggers.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "discard", evidenceContains: "discard a card", cardFace: "back" },
  },
  {
    caseId: "eval-0273",
    cardName: "Lunarch Veteran // Luminous Phantom",
    face: "back",
    exactOracleText: "Whenever another creature you control leaves the battlefield, you gain 1 life.",
    parserPrimitive: "gain_life",
    parserEvidence: "gain 1 life",
    layer1Structure: "back-face leave-the-battlefield trigger",
    decision: "add_gold",
    reason: "Back-face triggered gain life is Layer-2.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "gain_life", evidenceContains: "gain 1 life", cardFace: "back" },
  },
  {
    caseId: "eval-0276",
    cardName: "Invasion of Ulgrotha // Grandmother Ravi Sengir",
    face: "front",
    exactOracleText:
      "When this Siege enters, it deals 3 damage to any other target and you gain 3 life.",
    parserPrimitive: "gain_life",
    parserEvidence: "gain 3 life",
    layer1Structure: "siege ETB",
    decision: "add_gold",
    reason: "Siege ETB gain 3 life paired with deal_damage gold.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: { actionType: "gain_life", evidenceContains: "gain 3 life", cardFace: "front" },
  },
  {
    caseId: "eval-0278",
    cardName: "Invasion of Segovia // Caetus, Sea Tyrant of Segovia",
    face: "back",
    exactOracleText: "At the beginning of your end step, untap up to four target creatures.",
    parserPrimitive: "untap",
    parserEvidence: "untap up to four target creatures",
    layer1Structure: "transformed back-face end-step trigger",
    decision: "add_gold",
    reason: "Back-face end-step untap is Layer-2.",
    reviewer: GOLD_OMISSION_REVIEWER,
    reviewedAt: GOLD_OMISSION_REVIEWED_AT,
    goldAddition: {
      actionType: "untap",
      evidenceContains: "untap up to four target creatures",
      cardFace: "back",
    },
  },
];

export function isAdjudicatedReject(input: {
  caseId: string;
  parserPrimitive: string;
  parserEvidence: string;
}): GoldOmissionAdjudication | undefined {
  return GOLD_OMISSION_ADJUDICATIONS.find(
    (a) =>
      a.decision === "reject_parser_output" &&
      a.caseId === input.caseId &&
      a.parserPrimitive === input.parserPrimitive &&
      (input.parserEvidence.startsWith(a.parserEvidence.slice(0, 12)) ||
        a.parserEvidence.startsWith(input.parserEvidence.slice(0, 12))),
  );
}
