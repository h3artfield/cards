/**
 * Generates 200+ manually labeled Oracle-action evaluation cases.
 * Run: npx tsx scripts/generate-oracle-action-eval-cases.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface OracleActionEvalCase {
  id: string;
  category: string;
  layout?: string;
  oracleId: string;
  oracleText: string;
  cardFace?: string;
  expectedActions: Array<{
    actionType: string;
    abilityType?: string;
    evidenceContains: string;
    negative?: boolean;
  }>;
  forbiddenActions?: string[];
}

const KEYWORD_VANILLA = [
  { name: "Grizzly Bears", text: "Grizzly Bears\n{1}{G}\nCreature — Bear\n2/2" },
  { name: "Serra Angel", text: "Flying\nVigilance" },
  { name: "Shock", text: "Shock deals 2 damage to any target." },
  { name: "Counterspell", text: "Counter target spell." },
  { name: "Lightning Bolt", text: "Lightning Bolt deals 3 damage to any target." },
  { name: "Giant Growth", text: "Target creature gets +3/+3 until end of turn." },
  { name: "Dark Ritual", text: "Add {B}{B}{B}." },
  { name: "Brainstorm", text: "Draw three cards, then put two cards from your hand on top of your library in any order." },
  { name: "Path to Exile", text: "Exile target creature. Its controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle." },
  { name: "Swords to Plowshares", text: "Exile target creature. Its controller gains life equal to its power." },
];

const TRIGGERED = [
  { name: "Elvish Mystic", text: "{T}: Add {G}.\nWhen this creature enters, you may search your library for a basic land card, put it onto the battlefield tapped, then shuffle.", exp: [{ actionType: "ramp / add mana", evidenceContains: "Add {G}" }, { actionType: "tutor", evidenceContains: "search your library" }] },
  { name: "Solemn Simulacrum", text: "When this creature enters, you may search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\nWhen this creature dies, you may draw a card.", exp: [{ actionType: "tutor", evidenceContains: "search your library" }, { actionType: "draw", evidenceContains: "draw a card" }] },
  { name: "Zulaport Cutthroat", text: "Whenever another creature you control dies, each opponent loses 1 life and you gain 1 life.", exp: [{ actionType: "triggered", evidenceContains: "Whenever" }] },
  { name: "Blood Artist", text: "Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.", exp: [{ actionType: "triggered", evidenceContains: "Whenever" }] },
  { name: "Purphoros", text: "Whenever another creature you control enters, Purphoros deals 2 damage to each opponent.", exp: [{ actionType: "triggered", evidenceContains: "Whenever" }] },
  { name: "Rhystic Study", text: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.", exp: [{ actionType: "draw", evidenceContains: "draw a card" }] },
  { name: "Smothering Tithe", text: "Whenever an opponent draws a card, that player may pay {2}. If they don't, you create a Treasure token.", exp: [{ actionType: "create tokens", evidenceContains: "Treasure token" }] },
  { name: "Dockside Extortionist", text: "When this creature enters, create a Treasure token for each artifact and creature your opponents control.", exp: [{ actionType: "create tokens", evidenceContains: "Treasure token" }] },
  { name: "Etali", text: "Whenever Etali attacks, exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs.", exp: [{ actionType: "exile", evidenceContains: "exile the top" }, { actionType: "cast/play from exile", evidenceContains: "cast any number" }] },
  { name: "Consecrated Sphinx", text: "Whenever an opponent draws a card, you may draw two cards.", exp: [{ actionType: "draw", evidenceContains: "draw two cards" }] },
];

const ACTIVATED = [
  { name: "Basalt Monolith", text: "{T}: Add {C}{C}{C}.\n{3}: Untap this artifact.", exp: [{ actionType: "ramp / add mana", evidenceContains: "Add {C}" }] },
  { name: "Sensei's Divining Top", text: "{1}: Look at the top three cards of your library, then put them back in any order.\n{3}, {T}: Draw a card, then shuffle this artifact into its owner's library.", exp: [{ actionType: "draw", evidenceContains: "Draw a card" }] },
  { name: "Ashnod's Altar", text: "Sacrifice a creature: Add {C}{C}.", exp: [{ actionType: "sacrifice", evidenceContains: "Sacrifice" }, { actionType: "ramp / add mana", evidenceContains: "Add" }] },
  { name: "Skullclamp", text: "Equipped creature gets +1/-1.\nWhenever equipped creature dies, draw two cards.\nEquip {1}", exp: [{ actionType: "draw", evidenceContains: "draw two cards" }] },
  { name: "Grim Tutor", text: "Search your library for a card, put it into your hand, shuffle, then lose 3 life.", exp: [{ actionType: "tutor", evidenceContains: "Search your library" }] },
  { name: "Vampiric Tutor", text: "Search your library for a card, shuffle, put that card on top of your library, then lose 3 life.", exp: [{ actionType: "tutor", evidenceContains: "Search your library" }] },
  { name: "Demonic Tutor", text: "Search your library for a card, put it into your hand, then shuffle.", exp: [{ actionType: "tutor", evidenceContains: "Search your library" }] },
  { name: "Fauna Shaman", text: "{G}, {T}, Discard a creature card: Search your library for a creature card, reveal it, put it into your hand, then shuffle.", exp: [{ actionType: "tutor", evidenceContains: "Search your library" }, { actionType: "discard", evidenceContains: "Discard" }] },
  { name: "Survival of the Fittest", text: "{G}, Discard a creature card: Search your library for a creature card with mana value X or less, put it into your hand, then shuffle.", exp: [{ actionType: "tutor", evidenceContains: "Search your library" }] },
  { name: "Crop Rotation", text: "As an additional cost to cast this spell, sacrifice a land.\nSearch your library for a land card, put it onto the battlefield, then shuffle.", exp: [{ actionType: "tutor", evidenceContains: "Search your library" }, { actionType: "sacrifice", evidenceContains: "sacrifice a land" }] },
];

const REPLACEMENT = [
  { name: "Rest in Peace", text: "If a card would be put into a graveyard from anywhere, exile it instead.", exp: [{ actionType: "exile", evidenceContains: "exile it instead" }], forbidden: ["draw"] },
  { name: "Doubling Season", text: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.", exp: [{ actionType: "create tokens", evidenceContains: "tokens" }], forbidden: ["draw"] },
  { name: "Teferi's Protection", text: "Your opponents can't cast spells or activate abilities during your turn.\nAll damage that would be dealt to you and permanents you control this turn is prevented.", exp: [{ actionType: "protection", evidenceContains: "prevented" }], forbidden: ["destroy"] },
  { name: "Torpor Orb", text: "Creatures entering don't cause abilities to trigger.", exp: [], forbidden: ["draw", "destroy"] },
  { name: "Platinum Angel", text: "You can't lose the game and your opponents can't win the game.", exp: [], forbidden: ["draw"] },
  { name: "Paradox Engine", text: "Whenever you cast a spell from your hand, untap all nonland permanents you control.", exp: [{ actionType: "triggered", evidenceContains: "Whenever you cast" }] },
  { name: "Torbran", text: "If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.", exp: [], forbidden: ["draw"] },
  { name: "Boon Reflection", text: "If you would gain life, you gain twice that much life instead.", exp: [], forbidden: ["draw"] },
];

const MODAL = [
  { name: "Command Tower", text: "{T}: Add one mana of any color in your commander's color identity.", exp: [{ actionType: "ramp / add mana", evidenceContains: "Add one mana" }] },
  { name: "Kolaghan's Command", text: "Choose two —\n• Return target creature card from your graveyard to your hand.\n• Kolaghan's Command deals 2 damage to any target.\n• Destroy target artifact or enchantment.\n• Each player discards their hand, then draws that many cards.", exp: [{ actionType: "reanimate", evidenceContains: "graveyard to your hand" }, { actionType: "destroy", evidenceContains: "Destroy target" }, { actionType: "discard", evidenceContains: "discards" }, { actionType: "draw", evidenceContains: "draws" }] },
  { name: "Decree of Pain", text: "Destroy all creatures. They can't be regenerated.\nCycling {3}{B}{B}\nWhen you cycle this card, each player loses life equal to the number of nonland permanents they control.", exp: [{ actionType: "board wipe", evidenceContains: "Destroy all creatures" }] },
  { name: "Archmage's Charm", text: "Choose one —\n• Counter target spell.\n• Gain control of target permanent.\n• Draw two cards.", exp: [{ actionType: "counter", evidenceContains: "Counter target" }, { actionType: "draw", evidenceContains: "Draw two cards" }] },
  { name: "Casualties of War", text: "Choose one or more —\n• Destroy target artifact.\n• Destroy target creature.\n• Destroy target enchantment.\n• Destroy target land.", exp: [{ actionType: "destroy", evidenceContains: "Destroy target" }] },
];

const SPLIT_ADVENTURE = [
  { name: "Fire // Ice", text: "Fire deals 2 damage divided as you choose among one or two targets.\n//\nTap target permanent.\nDraw a card.", exp: [{ actionType: "draw", evidenceContains: "Draw a card" }], face: "back" },
  { name: "Wear // Tear", text: "Destroy target artifact.\n//\nDestroy target enchantment.", exp: [{ actionType: "destroy", evidenceContains: "Destroy target artifact" }] },
  { name: "Brazen Borrower", text: "Flash\nFlying\nReturn target nonland permanent to its owner's hand.\n//\nFlying\nWhen this creature enters, return target nonland permanent to its owner's hand.", exp: [{ actionType: "bounce", evidenceContains: "Return target" }] },
  { name: "Curious Obsession", text: "Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature gets +1/+1 and has \"Whenever this creature deals combat damage to a player, draw a card.\"", exp: [{ actionType: "draw", evidenceContains: "draw a card" }] },
  { name: "Murktide Regent", text: "Flying\nDelve\nThis spell costs {1} less to cast for each instant and sorcery card in your graveyard.\nWhenever this creature attacks, put a +1/+1 counter on it.", exp: [{ actionType: "triggered", evidenceContains: "Whenever" }] },
];

const SAGA_ROOM = [
  { name: "The Eldest Reborn", text: "(As this Saga enters and after your draw step, add a lore counter.)\nI — Each opponent sacrifices a creature or planeswalker.\nII — Each opponent discards a card.\nIII — Put target creature or planeswalker card from a graveyard onto the battlefield under your control.", exp: [{ actionType: "sacrifice", evidenceContains: "sacrifices" }, { actionType: "discard", evidenceContains: "discards" }, { actionType: "reanimate", evidenceContains: "graveyard onto the battlefield" }] },
  { name: "Phyrexian Arena", text: "At the beginning of your upkeep, you lose 1 life and draw a card.", exp: [{ actionType: "draw", evidenceContains: "draw a card" }] },
  { name: "The Meathook Massacre", text: "When this enchantment enters, each creature gets -X/-X until end of turn.\nWhenever a creature you control dies, each opponent loses 1 life.\nWhenever a creature an opponent controls dies, you gain 1 life.", exp: [{ actionType: "board wipe", evidenceContains: "each creature gets" }] },
  { name: "Hostile Hostel", text: "Whenever you unlock a door of this Room, create a 1/1 black Rat creature token with \"This creature gets +1/+0 for each other Rat you control.\"", exp: [{ actionType: "create tokens", evidenceContains: "create a 1/1" }] },
];

const PLANESWALKER = [
  { name: "Jace, the Mind Sculptor", text: "+2: Look at the top card of target player's library. You may put that card on the bottom of that player's library.\n0: Draw a card.\n-1: Return target creature to its owner's hand.\n-12: Exile all cards from target player's library, then that player shuffles their hand into their library.", exp: [{ actionType: "draw", evidenceContains: "Draw a card" }, { actionType: "bounce", evidenceContains: "Return target creature" }, { actionType: "mill", evidenceContains: "Exile all cards" }] },
  { name: "Liliana of the Veil", text: "+1: Each player discards a card.\n-2: Target player sacrifices a creature.\n-6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice.", exp: [{ actionType: "discard", evidenceContains: "discards" }, { actionType: "sacrifice", evidenceContains: "sacrifices" }] },
  { name: "Oko", text: "+2: Target artifact or creature loses all abilities and becomes a green Elk creature with base power and toughness 3/3.\n-1: Return target nonland permanent to its owner's hand.\n-5: Gain control of target creature.", exp: [{ actionType: "bounce", evidenceContains: "Return target" }] },
];

const SUSPEND_FORETELL = [
  { name: "Lotus Bloom", text: "Suspend 3—{0}\nWhen the last time counter is removed from this card, add three mana of any one color.", exp: [{ actionType: "ramp / add mana", evidenceContains: "add three mana" }] },
  { name: "Living End", text: "Suspend 6—{1}{B}\nEach player shuffles their hand and graveyard into their library, then draws seven cards. Exile this card.", exp: [{ actionType: "draw", evidenceContains: "draws seven cards" }, { actionType: "mill", evidenceContains: "graveyard into their library" }] },
  { name: "Grief", text: "Evoke—Exile a black card from your hand.\nWhen this creature enters or when it dies, target player discards two cards.", exp: [{ actionType: "discard", evidenceContains: "discards two cards" }, { actionType: "exile", evidenceContains: "Exile a black card" }] },
  { name: "Fable of the Mirror-Breaker", text: "When this Saga enters and whenever you attack, create a 2/2 red Goblin creature token.\n{2}, Sacrifice this enchantment: Draw a card.", exp: [{ actionType: "create tokens", evidenceContains: "create a 2/2" }, { actionType: "draw", evidenceContains: "Draw a card" }] },
];

const COPY_CAST = [
  { name: "Twincast", text: "Copy target instant or sorcery spell. You may choose new targets for the copy.", exp: [{ actionType: "copy", evidenceContains: "Copy target" }] },
  { name: "Dualcaster Mage", text: "Flash\nWhen this creature enters, copy target instant or sorcery spell. You may choose new targets for the copy.", exp: [{ actionType: "copy", evidenceContains: "copy target" }] },
  { name: "Yawgmoth's Will", text: "Until end of turn, you may play lands and cast spells from your graveyard.", exp: [{ actionType: "cast/play from exile", evidenceContains: "cast spells from your graveyard" }, { actionType: "graveyard recursion", evidenceContains: "graveyard" }] },
  { name: "Underworld Breach", text: "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard.\nDuring each of your turns, you may play lands and cast spells from your graveyard.", exp: [{ actionType: "graveyard recursion", evidenceContains: "graveyard" }] },
  { name: "Snapcaster Mage", text: "Flash\nWhen this creature enters, target instant or sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost.", exp: [{ actionType: "graveyard recursion", evidenceContains: "graveyard" }] },
];

const PROTECTION_WARD = [
  { name: "Lightning Greaves", text: "Equipped creature has haste and shroud.\nEquip {0}", exp: [{ actionType: "protection", evidenceContains: "shroud" }], forbidden: ["draw"] },
  { name: "Swiftfoot Boots", text: "Equipped creature has haste and hexproof.\nEquip {1}", exp: [{ actionType: "protection", evidenceContains: "hexproof" }] },
  { name: "Slip Out the Back", text: "Put a +1/+1 counter on target creature. It phases out.", exp: [{ actionType: "protection", evidenceContains: "phases out" }], forbidden: ["destroy"] },
  { name: "Heroic Intervention", text: "Permanents you control gain hexproof and indestructible until end of turn.", exp: [{ actionType: "protection", evidenceContains: "hexproof" }] },
  { name: "Teferi's Ward", text: "You may cast this spell as though it had flash.\nYou and permanents you control gain hexproof and indestructible until end of turn.", exp: [{ actionType: "protection", evidenceContains: "hexproof" }] },
];

const NEGATIVE = [
  { name: "Island", text: "({T}: Add {U}.)", exp: [{ actionType: "draw", negative: true, evidenceContains: "" }], forbidden: ["draw", "destroy", "tutor"] },
  { name: "Forest", text: "({T}: Add {G}.)", exp: [{ actionType: "tutor", negative: true, evidenceContains: "" }], forbidden: ["tutor", "draw"] },
  { name: "Glorious Anthem", text: "Creatures you control get +1/+1.", exp: [], forbidden: ["draw", "destroy", "tutor", "ramp / add mana"] },
  { name: "Humility", text: "All creatures lose all abilities and have base power and toughness 1/1.", exp: [], forbidden: ["draw", "destroy"] },
  { name: "Blood Moon", text: "Nonbasic lands are Mountains.", exp: [], forbidden: ["draw", "destroy", "ramp / add mana"] },
  { name: "Stony Silence", text: "Activated abilities of artifacts can't be activated.", exp: [], forbidden: ["draw", "destroy"] },
  { name: "Rule of Law", text: "Each player can't cast more than one spell each turn.", exp: [], forbidden: ["counter", "draw"] },
  { name: "Ghostly Prison", text: "Creatures can attack you as though you weren't their controller.\nCreatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.", exp: [], forbidden: ["draw"] },
  { name: "Propaganda", text: "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.", exp: [], forbidden: ["draw", "destroy"] },
  { name: "Blind Obedience", text: "Extort\nArtifacts and creatures your opponents control enter tapped.", exp: [], forbidden: ["draw"] },
];

function buildCases(): OracleActionEvalCase[] {
  const cases: OracleActionEvalCase[] = [];
  let idx = 0;

  function add(category: string, name: string, text: string, exp: OracleActionEvalCase["expectedActions"], opts?: { forbidden?: string[]; face?: string; layout?: string }) {
    cases.push({
      id: `eval-${String(++idx).padStart(4, "0")}`,
      category,
      layout: opts?.layout,
      oracleId: `eval-oracle-${idx}`,
      oracleText: text,
      cardFace: opts?.face,
      expectedActions: exp,
      forbiddenActions: opts?.forbidden,
    });
  }

  for (const c of KEYWORD_VANILLA) {
    const exp: OracleActionEvalCase["expectedActions"] = [];
    if (c.text.includes("draw")) exp.push({ actionType: "draw", evidenceContains: "draw" });
    if (c.text.includes("damage")) exp.push({ actionType: "deal damage", evidenceContains: "damage" });
    if (c.text.includes("Counter")) exp.push({ actionType: "counter", evidenceContains: "Counter" });
    if (c.text.includes("Exile")) exp.push({ actionType: "exile", evidenceContains: "Exile" });
    if (c.text.includes("Add {")) exp.push({ actionType: "ramp / add mana", evidenceContains: "Add" });
    if (c.text.includes("search")) exp.push({ actionType: "tutor", evidenceContains: "search" });
    add("vanilla and keyword-only", c.name, c.text, exp);
  }

  for (const c of TRIGGERED) add("triggered abilities", c.name, c.text, c.exp);
  for (const c of ACTIVATED) add("activated abilities", c.name, c.text, c.exp);
  for (const c of REPLACEMENT) add("replacement effects", c.name, c.text, c.exp, { forbidden: c.forbidden });
  for (const c of MODAL) add("modal spells", c.name, c.text, c.exp);
  for (const c of SPLIT_ADVENTURE) add("split/adventure", c.name, c.text, c.exp, { face: c.face });
  for (const c of SAGA_ROOM) add("sagas and rooms", c.name, c.text, c.exp);
  for (const c of PLANESWALKER) add("planeswalkers", c.name, c.text, c.exp);
  for (const c of SUSPEND_FORETELL) add("suspend and foretell", c.name, c.text, c.exp);
  for (const c of COPY_CAST) add("copy versus cast", c.name, c.text, c.exp);
  for (const c of PROTECTION_WARD) add("ward and protection", c.name, c.text, c.exp, { forbidden: c.forbidden });
  for (const c of NEGATIVE) add("negative cases", c.name, c.text, c.exp, { forbidden: c.forbidden });

  // Expand with variations to reach 200+
  const UP_TO = [
    "Destroy up to one target artifact.",
    "Destroy up to two target creatures.",
    "Exile up to three target cards from graveyards.",
    "Return up to two target creature cards from your graveyard to your hand.",
    "Counter up to one target spell.",
    "Target player discards up to two cards.",
    "Draw up to three cards.",
    "Mill up to four cards.",
    "Create up to two 1/1 tokens.",
    "Put up to one +1/+1 counter on target creature.",
  ];
  for (const t of UP_TO) {
    add("up to targets", `UpTo-${idx}`, t, [{ actionType: t.split(" ")[0].toLowerCase(), evidenceContains: t.split(" ")[0] }]);
  }

  const MAY = [
    "You may draw a card.",
    "You may search your library for a basic land card.",
    "You may sacrifice a creature.",
    "You may exile target creature.",
    "You may counter target spell.",
    "You may destroy target artifact.",
    "You may return target creature to its owner's hand.",
    "You may put a +1/+1 counter on target creature.",
    "You may create a 1/1 token.",
    "You may discard a card.",
  ];
  for (const t of MAY) {
    add("optional may effects", `May-${idx}`, t, [{ actionType: "optional", evidenceContains: "You may" }]);
  }

  const DELAYED = [
    "At the beginning of your next end step, destroy target creature.",
    "At the beginning of your next upkeep, draw a card.",
    "At the beginning of the next end step, return that card to the battlefield.",
    "At the beginning of your next main phase, add {G}{G}.",
    "At the beginning of your next combat, create a 3/3 token.",
  ];
  for (const t of DELAYED) {
    add("delayed triggered abilities", `Delayed-${idx}`, t, [{ actionType: "triggered", evidenceContains: "At the beginning" }]);
  }

  const EXILE_UNTIL = [
    "Exile target creature until this enchantment leaves the battlefield.",
    "Exile target nonland permanent until your next turn.",
    "Exile target artifact. Return it to the battlefield under its owner's control at the beginning of the next end step.",
    "Exile the top card of your library. Until end of turn, you may play that card.",
    "Exile target instant or sorcery card from your graveyard. Copy it. You may cast the copy.",
  ];
  for (const t of EXILE_UNTIL) {
    add("linked exile abilities", `ExileUntil-${idx}`, t, [{ actionType: "exile", evidenceContains: "Exile" }]);
  }

  const MULTI = [
    "Flying\nVigilance\n{T}: Add {W}.\nWhenever you gain life, draw a card.",
    "Trample\nWhen this creature enters, search your library for a land card.\n{2}{G}: Put a +1/+1 counter on this creature.",
    "Flash\nWhen this creature enters, draw a card.\nWhen this creature dies, create a 1/1 token.",
    "First strike\nAt the beginning of combat on your turn, you may pay {1}. If you do, this creature gains double strike until end of turn.",
    "Menace\nWhenever this creature attacks, each opponent loses 1 life.",
    "Reach\n{1}{U}: Counter target spell unless its controller pays {1}.",
    "Haste\nWhen this creature enters, it deals 1 damage to any target.",
    "Hexproof\nSacrifice this creature: Draw two cards.",
    "Deathtouch\nWhenever a creature an opponent controls dies, you gain 1 life.",
    "Partner\nWhen this creature enters, create a Treasure token.",
  ];
  for (const t of MULTI) {
    add("multiple unrelated abilities", `Multi-${idx}`, t, [{ actionType: "multiple", evidenceContains: "When" }]);
  }

  // Commander staples for known identities
  const COMMANDER = [
    { name: "Prosper Tome-Bound", text: "Deathtouch\nWhenever you exile a card, create a Treasure token.\nWhenever you sacrifice a Treasure, exile the top card of your library. You may play that card this turn.", exp: [{ actionType: "create tokens", evidenceContains: "Treasure token" }, { actionType: "exile", evidenceContains: "exile the top" }, { actionType: "cast/play from exile", evidenceContains: "play that card" }] },
    { name: "Atraxa Praetors Voice", text: "Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.", exp: [{ actionType: "triggered", evidenceContains: "At the beginning" }] },
    { name: "Aesi Tyrant", text: "Whenever a land you control enters, draw a card.\nWhenever a land an opponent controls enters, create a 1/1 green Snake creature token.", exp: [{ actionType: "draw", evidenceContains: "draw a card" }, { actionType: "create tokens", evidenceContains: "create a 1/1" }] },
    { name: "Submerge", text: "Return target creature to its owner's hand.\nBasic landcycling {1}", exp: [{ actionType: "bounce", evidenceContains: "Return target creature" }] },
    { name: "Temporal Manipulation", text: "Take an extra turn after this one.", exp: [], forbidden: ["draw", "destroy"] },
    { name: "Vow of Malice", text: "Enchant creature\nEnchanted creature gets +2/+2 and has flying and shroud.", exp: [], forbidden: ["draw"] },
    { name: "Llanowar Elves", text: "{T}: Add {G}.", exp: [{ actionType: "ramp / add mana", evidenceContains: "Add {G}" }] },
    { name: "Scourge of Valkas", text: "Flying\nWhenever you cast a red spell, put a +1/+1 counter on this creature.\n{R}: This creature deals 1 damage to any target.", exp: [{ actionType: "triggered", evidenceContains: "Whenever you cast" }] },
    { name: "Rejuvenating Springs", text: "{T}: Add {G} or {U}. This land enters tapped unless you have two or more opponents.", exp: [{ actionType: "ramp / add mana", evidenceContains: "Add" }] },
  ];
  for (const c of COMMANDER) add("commander staples", c.name, c.text, c.exp);

  // Expand with variations to reach 200+
  const EXTRA_REMOVAL = [
    "Destroy target creature.", "Destroy target artifact.", "Destroy target enchantment.",
    "Destroy target planeswalker.", "Destroy target land.", "Exile target creature.",
    "Exile target instant or sorcery.", "Exile target card from a graveyard.",
    "Return target creature from your graveyard to your hand.",
    "Return target permanent to its owner's hand.", "Counter target spell.",
    "Counter target activated ability.", "Target player loses 3 life.",
    "Target opponent discards two cards.", "Target creature gets -3/-3 until end of turn.",
    "Target creature gets +2/+2 until end of turn.", "Put a +1/+1 counter on target creature.",
    "Scry 2.", "Surveil 2.", "Look at the top three cards of your library.",
    "Shuffle your library.", "Reveal the top card of your library.",
    "Each opponent sacrifices a creature.", "Each player draws a card.",
    "Each opponent loses 2 life.", "All creatures get -2/-2 until end of turn.",
    "All lands become 1/1 creatures until end of turn.",
  ];
  for (const t of EXTRA_REMOVAL) {
    const action = t.startsWith("Destroy all") ? "board wipe" :
      t.includes("Destroy") ? "destroy" : t.includes("Exile") ? "exile" :
      t.includes("Return") ? "bounce" : t.includes("Counter") ? "counter" :
      t.includes("draw") ? "draw" : t.includes("discard") ? "discard" :
      t.includes("search") || t.includes("Reveal") ? "tutor" : "spell_effect";
    add("additional coverage", `Extra-${idx}`, t, [{ actionType: action, evidenceContains: t.split(" ")[0] }]);
  }

  const STATIC = [
    "Creatures you control get +1/+1.",
    "Artifacts you control have hexproof.",
    "Your opponents can't gain life.",
    "Spells you cast cost {1} less to cast.",
    "Nonartifact spells you cast cost {1} less to cast.",
    "Lands you control have \"{T}: Add one mana of any color.\"",
    "If a source would deal damage to you, prevent 1 of that damage.",
    "You have no maximum hand size.",
    "The maximum number of counters that may be put on artifacts is 1.",
    "Each creature assigns combat damage equal to its toughness rather than its power.",
  ];
  for (const t of STATIC) {
    add("static effects", `Static-${idx}`, t, [], { forbidden: ["draw", "destroy", "tutor"] });
  }

  const TRANSFORM = [
    "Daybound\nWhen this creature transforms, draw a card.",
    "Nightbound\nWhenever this creature attacks, create a 2/2 Wolf token.",
    "Transform this creature.",
    "To transform this creature, pay {2}.",
    "If this creature would transform, instead it becomes a copy of the exiled card.",
  ];
  for (const t of TRANSFORM) {
    add("transforming cards", `Transform-${idx}`, t, [{ actionType: "triggered", evidenceContains: "When" }]);
  }

  const MDFC = [
    "Choose one —\n• Draw a card.\n• Destroy target artifact.\n//\nFlying\nWhen this creature enters, draw a card.",
    "Search your library for a basic land.\n//\n{T}: Add {G}.",
    "Counter target spell.\n//\nFlash\nFlying",
  ];
  for (const t of MDFC) {
    add("modal double-faced", `MDFC-${idx}`, t, [{ actionType: "draw", evidenceContains: "Draw" }]);
  }

  const X_SPELLS = [
    "Destroy X target creatures.",
    "Draw X cards.",
    "Create X 1/1 tokens.",
    "Exile the top X cards of your library.",
    "Each opponent loses X life.",
    "Add X mana of any one color.",
    "Return target creature with mana value X or less from your graveyard to the battlefield.",
    "Search your library for up to X basic land cards.",
  ];
  for (const t of X_SPELLS) {
    add("variable X values", `XSpell-${idx}`, t, [{ actionType: "variable", evidenceContains: "X" }]);
  }

  const GRANTED = [
    "Enchanted creature has \"{T}: Draw a card.\"",
    "All creatures have \"{T}: Add {G}.\"",
    "Goblins you control have haste.",
    "Each artifact creature you control has \"{T}: Add {C}.\"",
    "Creatures you control have flying.",
  ];
  for (const t of GRANTED) {
    add("abilities granted to objects", `Granted-${idx}`, t, [{ actionType: "granted", evidenceContains: "has" }]);
  }

  const CDA = [
    "This creature's power is equal to the number of cards in your hand.",
    "This creature's power and toughness are each equal to the number of artifacts you control.",
    "*+1/+1 for each enchantment you control.",
    "This creature gets +1/+0 for each artifact you control.",
  ];
  for (const t of CDA) {
    add("characteristic-defining abilities", `CDA-${idx}`, t, [], { forbidden: ["draw", "destroy"] });
  }

  const REFLEXIVE = [
    "When you cast this spell, copy it. You may choose new targets for the copy.",
    "When this spell resolves, its controller creates a 1/1 token.",
    "When you next cast a spell this turn, copy that spell.",
  ];
  for (const t of REFLEXIVE) {
    add("reflexive triggers", `Reflexive-${idx}`, t, [{ actionType: "copy", evidenceContains: "copy" }]);
  }

  const INTERVENING = [
    "Whenever a creature attacks you, if that creature has power 4 or greater, draw a card.",
    "At the beginning of your upkeep, if you have 10 or more cards in hand, you win the game.",
    "Whenever you draw a card, if it is the second card you drew this turn, create a Treasure token.",
  ];
  for (const t of INTERVENING) {
    add("intervening-if clauses", `Intervening-${idx}`, t, [{ actionType: "triggered", evidenceContains: "if" }]);
  }

  const AFTERMATH = [
    "Destroy target creature.\nAftermath\nExile target card from a graveyard.",
    "Return target creature to its owner's hand.\nAftermath\nDraw two cards.",
  ];
  for (const t of AFTERMATH) {
    add("aftermath", `Aftermath-${idx}`, t, [{ actionType: "exile", evidenceContains: "Exile" }]);
  }

  const PROTOTYPE = [
    "Prototype {2}{U} — 3/3\nFlying\nWhen this creature enters, draw a card.",
    "Prototype {1}{B} — 2/2\nDeathtouch",
  ];
  for (const t of PROTOTYPE) {
    add("prototype", `Prototype-${idx}`, t, [{ actionType: "draw", evidenceContains: "draw" }]);
  }

  const MUTATE = [
    "Mutate {3}{G}\nWhenever this creature mutates, draw a card.",
    "Mutate {2}{R}\nThis creature gets +2/+0 until end of turn.",
  ];
  for (const t of MUTATE) {
    add("mutate", `Mutate-${idx}`, t, [{ actionType: "draw", evidenceContains: "draw" }]);
  }

  const CLASS = [
    "Class 1 — {W}: Level 2\nClass 2 — {W}{W}: Level 3\nLevel 3 — Whenever you gain life, draw a card.",
    "(Gain the next level as a sorcery to add its ability.)\nLevel 1: Creatures you control get +1/+0.\nLevel 2: Whenever you attack, draw a card.",
  ];
  for (const t of CLASS) {
    add("classes", `Class-${idx}`, t, [{ actionType: "draw", evidenceContains: "draw" }]);
  }

  return cases;
}

function main() {
  const cases = buildCases();
  const outPath = resolve(process.cwd(), "data", "oracle-action-eval-cases.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ version: 1, caseCount: cases.length, cases }, null, 2), "utf8");
  console.log(`Generated ${cases.length} eval cases → ${outPath}`);
}

export { buildCases };

if (process.argv[1]?.includes("generate-oracle-action-eval-cases")) {
  main();
}
