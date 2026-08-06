/**
 * Manually reviewed multiface development cases and gold patches for development_set_v4.
 */
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

/** New multiface cases appended to development_set_v4 (eval-0257+). */
export const NEW_MULTIFACE_CASES: OracleActionEvalCaseV2[] = [
  {
    id: "eval-0257",
    category: "split/adventure",
    layout: "split",
    oracleId: "eval-oracle-257",
    oracleText: "Destroy target creature.\n//\nTarget player gains 3 life.",
    expectedPrimitiveActions: [
      { actionType: "destroy", evidenceContains: "Destroy target creature", cardFace: "front" },
      { actionType: "gain_life", evidenceContains: "gains 3 life", cardFace: "back" },
    ],
  },
  {
    id: "eval-0258",
    category: "split/adventure",
    layout: "split",
    oracleId: "eval-oracle-258",
    oracleText: "Flying\n(This creature can't be blocked except by creatures with flying.)\n//\nDraw two cards.",
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "Draw two cards", cardFace: "back" },
    ],
  },
  {
    id: "eval-0259",
    category: "split/adventure",
    layout: "split",
    oracleId: "eval-oracle-259",
    oracleText:
      "Surveil 2, then draw a card.\n//\nReturn target nonland permanent to its owner's hand.\nDestroy target artifact.",
    expectedPrimitiveActions: [
      { actionType: "surveil", evidenceContains: "Surveil 2", cardFace: "front" },
      { actionType: "draw", evidenceContains: "draw a card", cardFace: "front" },
      { actionType: "return_to_hand", evidenceContains: "Return target nonland permanent", cardFace: "back" },
      { actionType: "destroy", evidenceContains: "Destroy target artifact", cardFace: "back" },
    ],
  },
  {
    id: "eval-0260",
    category: "split/adventure",
    layout: "adventure",
    oracleId: "eval-oracle-260",
    oracleText:
      "Creature — Elf Warrior\n3/2\n//\nInstant — Adventure\nDeal 3 damage to any target.",
    expectedPrimitiveActions: [
      { actionType: "deal_damage", evidenceContains: "Deal 3 damage", cardFace: "back" },
    ],
  },
  {
    id: "eval-0261",
    category: "split/adventure",
    layout: "adventure",
    oracleId: "eval-oracle-261",
    oracleText:
      "Whenever this creature attacks, draw a card.\n//\nInstant — Adventure\nSearch your library for a basic land card, put it onto the battlefield tapped, then shuffle.",
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "draw a card", cardFace: "front" },
      { actionType: "search_library", evidenceContains: "Search your library", cardFace: "back" },
    ],
  },
  {
    id: "eval-0262",
    category: "split/adventure",
    layout: "adventure",
    oracleId: "eval-oracle-262",
    oracleText: "Defender\n//\nSorcery — Adventure\nExile target creature.",
    expectedPrimitiveActions: [
      { actionType: "exile", evidenceContains: "Exile target creature", cardFace: "back" },
    ],
  },
  {
    id: "eval-0263",
    category: "sagas and rooms",
    layout: "room",
    oracleId: "eval-oracle-263",
    oracleText:
      "Room — Dungeon\nWhen you unlock this door, draw a card.\n//\nRoom — Lair\nWhen you unlock this door, create a 1/1 black Rat creature token.",
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "draw a card", cardFace: "left" },
      { actionType: "create_token", evidenceContains: "create a 1/1 black Rat", cardFace: "right" },
    ],
  },
  {
    id: "eval-0264",
    category: "sagas and rooms",
    layout: "room",
    oracleId: "eval-oracle-264",
    oracleText:
      "Room — Mirror\nWhen you unlock this door, destroy target artifact.\n//\nRoom — Vault\nWhen you unlock this door, draw a card.",
    expectedPrimitiveActions: [
      { actionType: "destroy", evidenceContains: "destroy target artifact", cardFace: "left" },
      { actionType: "draw", evidenceContains: "draw a card", cardFace: "right" },
    ],
  },
  {
    id: "eval-0265",
    category: "transforming cards",
    layout: "transform",
    oracleId: "eval-oracle-265",
    oracleText:
      "Daybound\nWhen this creature transforms into Daybound, draw a card.\n//\nNightbound\nWhenever this creature attacks, create a 2/2 Wolf creature token.",
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "draw a card", cardFace: "front" },
      { actionType: "create_token", evidenceContains: "create a 2/2 Wolf", cardFace: "back" },
    ],
  },
  {
    id: "eval-0266",
    category: "transforming cards",
    layout: "transform",
    oracleId: "eval-oracle-266",
    oracleText:
      "Daybound\nWhen this creature enters, draw a card.\n//\nNightbound\nThis creature gets +2/+2 as long as it's night.",
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "draw a card", cardFace: "front" },
    ],
  },
  {
    id: "eval-0267",
    category: "modal double-faced",
    layout: "mdfc",
    oracleId: "eval-oracle-267",
    oracleText:
      "Choose one —\n• Counter target spell.\n• Destroy target artifact.\n//\nFlash\nWhen this creature enters, draw a card.",
    expectedPrimitiveActions: [
      { actionType: "counter", evidenceContains: "Counter target spell", cardFace: "front" },
      { actionType: "destroy", evidenceContains: "Destroy target artifact", cardFace: "front" },
      { actionType: "draw", evidenceContains: "draw a card", cardFace: "back" },
    ],
  },
  {
    id: "eval-0268",
    category: "aftermath",
    layout: "aftermath",
    oracleId: "eval-oracle-268",
    oracleText:
      "Destroy target artifact.\nAftermath\nDraw a card.",
    expectedPrimitiveActions: [
      { actionType: "destroy", evidenceContains: "Destroy target artifact", cardFace: "front" },
      { actionType: "draw", evidenceContains: "Draw a card", cardFace: "aftermath" },
    ],
  },
  {
    id: "eval-0269",
    category: "split/adventure",
    layout: "split",
    oracleId: "eval-oracle-269",
    oracleText: "Draw a card.\n//\nDraw two cards.",
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "Draw a card", cardFace: "front" },
      { actionType: "draw", evidenceContains: "Draw two cards", cardFace: "back" },
    ],
  },
  {
    id: "eval-0270",
    category: "modal double-faced",
    layout: "mdfc",
    oracleId: "eval-oracle-270",
    oracleText: "Flash\nFlying\n//\nWhen this creature dies, draw a card.",
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "draw a card", cardFace: "back" },
    ],
  },
  {
    id: "eval-0271",
    category: "sagas and rooms",
    layout: "room",
    oracleId: "eval-oracle-271",
    oracleText:
      "Room — Study\nWhen you unlock this door, each player draws a card.\n//\nRoom — Sanctuary\nWhen you unlock this door, destroy target creature.",
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "draws a card", cardFace: "left" },
      { actionType: "destroy", evidenceContains: "destroy target creature", cardFace: "right" },
    ],
  },
  {
    id: "eval-0272",
    category: "transforming cards",
    layout: "transform",
    oracleId: "eval-oracle-272",
    oracleText:
      "Daybound\nWhen this creature dies, draw a card.\n//\nNightbound\nWhenever this creature attacks, you gain 1 life.",
    expectedPrimitiveActions: [
      { actionType: "draw", evidenceContains: "draw a card", cardFace: "front" },
      { actionType: "gain_life", evidenceContains: "gain 1 life", cardFace: "back" },
    ],
  },
];

/** In-place gold patches for existing multifaced cases. */
export function applyMultifaceGoldPatches(cases: OracleActionEvalCaseV2[]): number {
  let patchCount = 0;

  const patch = (id: string, updater: (c: OracleActionEvalCaseV2) => void) => {
    const c = cases.find((x) => x.id === id);
    if (!c) return;
    updater(c);
    patchCount += 1;
  };

  patch("eval-0044", (c) => {
    c.layout = "split";
    c.expectedPrimitiveActions = [
      { actionType: "tap", evidenceContains: "Tap target permanent", cardFace: "back" },
      { actionType: "draw", evidenceContains: "Draw a card", cardFace: "back" },
    ];
  });

  patch("eval-0045", (c) => {
    c.layout = "split";
    c.expectedPrimitiveActions = [
      { actionType: "destroy", evidenceContains: "Destroy target artifact", cardFace: "front" },
      { actionType: "destroy", evidenceContains: "Destroy target enchantment", cardFace: "back" },
    ];
  });

  patch("eval-0046", (c) => {
    c.layout = "mdfc";
    c.expectedPrimitiveActions = [
      { actionType: "return_to_hand", evidenceContains: "Return target nonland permanent", cardFace: "front" },
      {
        actionType: "return_to_hand",
        evidenceContains: "return target nonland permanent",
        cardFace: "back",
      },
    ];
  });

  patch("eval-0047", (c) => {
    c.category = "auras";
    delete c.layout;
  });

  patch("eval-0048", (c) => {
    c.category = "creatures";
    delete c.layout;
  });

  patch("eval-0171", (c) => {
    c.layout = "mdfc";
    c.expectedPrimitiveActions = [
      { actionType: "draw", evidenceContains: "Draw a card", cardFace: "front" },
      { actionType: "destroy", evidenceContains: "Destroy target artifact", cardFace: "front" },
      { actionType: "draw", evidenceContains: "draw a card", cardFace: "back" },
    ];
  });

  patch("eval-0172", (c) => {
    c.layout = "mdfc";
    c.expectedPrimitiveActions = [
      { actionType: "search_library", evidenceContains: "Search your library", cardFace: "front" },
      { actionType: "add_mana", evidenceContains: "Add {G}", cardFace: "back" },
    ];
    c.expectedRoles = [{ role: "ramp", fromPrimitiveActions: ["add_mana"] }];
  });

  patch("eval-0173", (c) => {
    c.layout = "mdfc";
    c.expectedPrimitiveActions = [
      { actionType: "counter", evidenceContains: "Counter target spell", cardFace: "front" },
    ];
    c.expectedRoles = [];
  });

  patch("eval-0197", (c) => {
    c.layout = "aftermath";
    c.expectedPrimitiveActions = [
      { actionType: "destroy", evidenceContains: "Destroy target creature", cardFace: "front" },
      { actionType: "exile", evidenceContains: "Exile target card", cardFace: "aftermath" },
    ];
  });

  patch("eval-0198", (c) => {
    c.layout = "aftermath";
    c.expectedPrimitiveActions = [
      { actionType: "return_to_hand", evidenceContains: "Return target creature", cardFace: "front" },
      { actionType: "draw", evidenceContains: "Draw two cards", cardFace: "aftermath" },
    ];
    c.expectedRoles = [
      { role: "removal", fromPrimitiveActions: ["return_to_hand"] },
      { role: "card_advantage", fromPrimitiveActions: ["draw"] },
    ];
  });

  return patchCount;
}
