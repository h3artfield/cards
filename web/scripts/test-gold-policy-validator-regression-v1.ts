/**
 * Gold Policy Validator regression tests — parser-blind fixtures.
 */
import { validateBenchmarkGoldPolicy, validateGoldAction } from "./lib/gold-policy-validator-v1.8";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

function caseOf(partial: Partial<OracleActionEvalCaseV2> & Pick<OracleActionEvalCaseV2, "id" | "oracleText">): OracleActionEvalCaseV2 {
  return {
    category: "regression",
    oracleId: "00000000-0000-0000-0000-000000000001",
    expectedPrimitiveActions: partial.expectedPrimitiveActions ?? [],
    ...partial,
  } as OracleActionEvalCaseV2;
}

const FIXTURES: Array<{ label: string; expectPass: boolean; cases: OracleActionEvalCaseV2[] }> = [
  {
    label: "valid_resolving_sacrifice",
    expectPass: true,
    cases: [
      caseOf({
        id: "gpv-sac-ok",
        oracleText: "{1}, Sacrifice this creature: Draw a card.",
        expectedPrimitiveActions: [{ actionType: "draw", evidenceContains: "Draw a card" }],
      }),
    ],
  },
  {
    label: "invalid_cost_sacrifice_gold",
    expectPass: false,
    cases: [
      caseOf({
        id: "gpv-sac-bad",
        oracleText: "{T}, Sacrifice this artifact: Add {G}.",
        expectedPrimitiveActions: [{ actionType: "sacrifice", evidenceContains: "Sacrifice this artifact" }],
      }),
    ],
  },
  {
    label: "type_line_planet_suppressed_not_gold",
    expectPass: true,
    cases: [
      caseOf({
        id: "gpv-planet-ok",
        oracleText:
          'Planet (When this permanent enters, exile the top five cards of your library as its resources.)\n{T}: Add {U}.',
        expectedPrimitiveActions: [{ actionType: "add_mana", evidenceContains: "Add {U}" }],
      }),
    ],
  },
  {
    label: "real_triggered_exile_retained",
    expectPass: true,
    cases: [
      caseOf({
        id: "gpv-exile-ok",
        oracleText: "When this creature enters, exile target creature an opponent controls.",
        expectedPrimitiveActions: [
          { actionType: "exile", evidenceContains: "exile target creature an opponent controls" },
        ],
      }),
    ],
  },
  {
    label: "invalid_permission_cast_gold",
    expectPass: false,
    cases: [
      caseOf({
        id: "gpv-cast-bad",
        oracleText: "You may cast creature spells from your graveyard.",
        expectedPrimitiveActions: [
          { actionType: "cast", evidenceContains: "You may cast creature spells from your graveyard" },
        ],
      }),
    ],
  },
  {
    label: "invalid_token_definition_add_mana",
    expectPass: false,
    cases: [
      caseOf({
        id: "gpv-scion-they-have",
        oracleText:
          'When this creature enters, create two 1/1 colorless Eldrazi Scion creature tokens. They have "Sacrifice this token: Add {C}."',
        expectedPrimitiveActions: [{ actionType: "add_mana", evidenceContains: "Add {C}" }],
      }),
    ],
  },
  {
    label: "invalid_token_definition_with_quote_put_counter",
    expectPass: false,
    cases: [
      caseOf({
        id: "gpv-ashiok-with-quote",
        oracleText:
          '−2: Create two 1/1 black Nightmare creature tokens with "At the beginning of combat on your turn, if a card was put into exile this turn, put a +1/+1 counter on this token."',
        expectedPrimitiveActions: [
          { actionType: "put_counter", evidenceContains: "put a +1/+1 counter on this token" },
        ],
      }),
    ],
  },
  {
    label: "invalid_copy_target_assignment_gold",
    expectPass: false,
    cases: [
      caseOf({
        id: "gpv-beamsplitter-copy-target",
        oracleText:
          "Whenever you cast an instant or sorcery spell that targets only this creature, if you control one or more other creatures that spell could target, choose one of those creatures. Copy that spell. The copy targets the chosen creature.",
        expectedPrimitiveActions: [
          { actionType: "copy", evidenceContains: "Copy that spell" },
          { actionType: "copy", evidenceContains: "copy target" },
        ],
      }),
    ],
  },
  {
    label: "valid_granted_you_own_have",
    expectPass: true,
    cases: [
      caseOf({
        id: "gpv-candlekeep-own",
        oracleText:
          'Commander creatures you own have "When this creature enters or leaves the battlefield, draw a card."',
        expectedPrimitiveActions: [{ actionType: "draw", evidenceContains: "draw a card" }],
      }),
    ],
  },
  {
    label: "valid_token_definition_it_has",
    expectPass: false,
    cases: [
      caseOf({
        id: "gpv-scion-it-has",
        oracleText: 'Create a 1/1 colorless Eldrazi Scion creature token. It has "Sacrifice this token: Add {C}."',
        expectedPrimitiveActions: [{ actionType: "add_mana", evidenceContains: "Add {C}" }],
      }),
    ],
  },
  {
    label: "invalid_trigger_condition_cast_alela",
    expectPass: false,
    cases: [
      caseOf({
        id: "gpv-alela-trigger-cast",
        cardName: "Alela, Cunning Conqueror",
        oracleText:
          "Flying\nWhenever you cast your first spell during each opponent's turn, create a 1/1 black Faerie Rogue creature token with flying.\nWhenever one or more Faeries you control deal combat damage to a player, goad target creature that player controls.",
        expectedPrimitiveActions: [
          { actionType: "create_token", evidenceContains: "create a 1/1 black Faerie Rogue creature token" },
          {
            actionType: "cast",
            evidenceContains:
              "cast your first spell during each opponent's turn, create a 1/1 black Faerie Rogue creature token with flying",
          },
        ],
      }),
    ],
  },
  {
    label: "invalid_trigger_condition_cast_aligned_heart",
    expectPass: false,
    cases: [
      caseOf({
        id: "gpv-aligned-heart-trigger-cast",
        cardName: "Aligned Heart",
        oracleText:
          "Flurry — Whenever you cast your second spell each turn, put a rally counter on this enchantment. Then create a 1/1 white Monk creature token with prowess for each rally counter on it. (Whenever you cast a noncreature spell, the token gets +1/+1 until end of turn.)",
        expectedPrimitiveActions: [
          { actionType: "create_token", evidenceContains: "create a 1/1 white Monk creature token" },
          {
            actionType: "cast",
            evidenceContains: "cast your second spell each turn, put a rally counter on this enchantment",
          },
        ],
      }),
    ],
  },
  {
    label: "valid_post_trigger_resolving_cast",
    expectPass: true,
    cases: [
      caseOf({
        id: "gpv-post-trigger-cast-ok",
        oracleText: "Whenever you attack with two or more creatures, you may cast a spell from your hand without paying its mana cost.",
        expectedPrimitiveActions: [
          { actionType: "cast", evidenceContains: "you may cast a spell from your hand without paying its mana cost" },
        ],
      }),
    ],
  },
  {
    label: "invalid_trigger_condition_discard_event",
    expectPass: false,
    cases: [
      caseOf({
        id: "gpv-discard-trigger-ref",
        oracleText: "Whenever one or more cards are discarded, draw a card.",
        expectedPrimitiveActions: [{ actionType: "discard", evidenceContains: "cards are discarded" }],
      }),
    ],
  },
  {
    label: "one_shot_cast_copy_ok",
    expectPass: true,
    cases: [
      caseOf({
        id: "gpv-cast-copy-ok",
        oracleText:
          "Whenever you cast a creature spell, Abigale becomes prepared. (While it's prepared, you may cast a copy of its spell.)",
        expectedPrimitiveActions: [
          { actionType: "cast", evidenceContains: "you may cast a copy of its spell", optionalEffect: true },
        ],
      }),
    ],
  },
  {
    label: "invalid_static_cast_activate_restriction_gold",
    expectPass: false,
    cases: [
      caseOf({
        id: "gpv-static-cast-restrict",
        oracleText:
          "Flying\nOther nonblack creatures you control get +1/+1.\nPlayers can't pay life or sacrifice creatures to cast spells or activate abilities.",
        expectedPrimitiveActions: [
          { actionType: "cast", evidenceContains: "cast spells or activate abilities" },
          { actionType: "sacrifice", evidenceContains: "sacrifice creatures to cast spells or activate abilities" },
        ],
      }),
    ],
  },
  {
    label: "invalid_foretell_deferred_cast_reminder_gold",
    expectPass: false,
    cases: [
      caseOf({
        id: "gpv-foretell-reminder",
        oracleText:
          "Create two 1/1 blue Bird creature tokens with flying. Take an extra turn after this one. Exile this card.\nForetell {4}{U}{U} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)",
        expectedPrimitiveActions: [
          { actionType: "cast", evidenceContains: "Cast it on a later turn for its foretell cost" },
        ],
      }),
    ],
  },
];

let failed = 0;
for (const fixture of FIXTURES) {
  const result = validateBenchmarkGoldPolicy({
    cases: fixture.cases,
    benchmarkHash: "regression",
    benchmarkPath: fixture.label,
  });
  const ok = result.pass === fixture.expectPass;
  if (!ok) {
    failed++;
    console.error(`FAIL ${fixture.label}: expected pass=${fixture.expectPass}, got pass=${result.pass}`, result.violations);
  } else {
    console.log(`OK ${fixture.label}`);
  }
}

// I2 contrast: parser must retain real ability on Planet card with modal
const alberix = caseOf({
  id: "gpv-alberix-modal",
  oracleText:
    "Planet (When this permanent enters, exile the top five cards of your library as its resources.)\nTrade Routes — At the beginning of your precombat main phase, choose one —\n• Discard a card. If you do, put two of Alberix's resources into its owner's hand.\n• Exile the top card of your library as a resource.",
  expectedPrimitiveActions: [
    { actionType: "discard", evidenceContains: "Discard a card" },
    { actionType: "exile", evidenceContains: "Exile the top card of your library as a resource" },
  ],
});
const alberixVal = validateBenchmarkGoldPolicy({
  cases: [alberix],
  benchmarkHash: "regression",
  benchmarkPath: "alberix_modal",
});
if (!alberixVal.pass) {
  failed++;
  console.error("FAIL alberix_modal gold valid", alberixVal.violations);
} else {
  console.log("OK alberix_modal gold valid");
}

if (failed > 0) process.exit(1);
console.log(JSON.stringify({ fixtures: FIXTURES.length, failed }, null, 2));
