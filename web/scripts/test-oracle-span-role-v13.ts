/**
 * Regression tests — parser v1.15 span-boundary layer + activatedColonSplit performance.
 * Run: npx tsx scripts/test-oracle-span-role-v13.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import {
  classifyTextRoleAt,
  compoundClauseSpansWithRoles,
  findReminderSpans,
} from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";

const PERF_BUDGET_MS = 500;
const DEV_CASE_BUDGET_MS = 15_000;

/** Oracle text that previously hung activatedColonSplit() due to catastrophic backtracking. */
const REGRESSION_HANG_CASES = [
  {
    name: "smothering_tithe_trigger",
    oracleText:
      "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")",
    expectActions: [{ type: "create_token", evidence: "create a Treasure token" }],
    forbidActions: ["add_mana", "sacrifice", "draw"],
    expectReminderKinds: ["mechanic_reminder"],
    expectTriggerEvent: true,
  },
  {
    name: "keldon_raider_optional_discard",
    oracleText: "When this creature enters, you may discard a card. If you do, draw a card.",
    expectActions: [
      { type: "draw", evidence: "draw a card" },
      { type: "discard", evidence: "discard a card" },
    ],
    discardRoleAt: "effect",
    drawRoleAt: "effect",
  },
  {
    name: "rest_in_peace_replacement",
    oracleText:
      "When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.",
    expectActions: [
      { type: "exile", evidence: "exile all graveyards" },
      { type: "exile", evidence: "exile it instead" },
    ],
  },
  {
    name: "faithless_looting_flashback_reminder",
    oracleText:
      "Draw two cards, then discard two cards.\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)",
    expectActions: [
      { type: "draw", evidence: "Draw two cards" },
      { type: "discard", evidence: "discard two cards" },
    ],
    forbidActions: ["cast"],
    expectReminderKinds: ["mechanic_reminder"],
  },
  {
    name: "dockside_treasure_reminder",
    oracleText:
      'When this creature enters, create X Treasure tokens, where X is the number of artifacts and enchantments your opponents control. (Treasure tokens are artifacts with "{T}, Sacrifice this token: Add one mana of any color.")',
    expectActions: [{ type: "create_token", evidence: "Treasure token" }],
    forbidActions: ["add_mana", "sacrifice"],
  },
  {
    name: "adventure_reminder_no_cast",
    oracleText:
      "Create two 1/1 green Saproling creature tokens.\n(You may cast the creature later from exile. Then exile this card.)",
    expectActions: [{ type: "create_token", evidence: "Saproling creature tokens" }],
    forbidActions: ["cast"],
    expectReminderKinds: ["mechanic_reminder"],
  },
  {
    name: "card_specific_parenthetical_not_suppressed",
    oracleText: "Flying\n(As this Saga enters and after your draw step, add a lore counter.)\nI — Create a 2/2 red Goblin Shaman creature token.",
    expectActions: [{ type: "create_token", evidence: "Create a 2/2 red Goblin" }],
    /** Saga chapter rules text is card-specific, not a keyword reminder — should still extract token. */
  },
  {
    name: "activated_mana_colon",
    oracleText: "{T}: Add {G}.",
    expectActions: [{ type: "add_mana", evidence: "Add {G}" }],
    expectCostAnnotation: true,
  },
];

const COMPOUND_CLAUSE_CASES = [
  {
    name: "tutor_search_put_shuffle",
    oracleText: "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.",
    expectActions: [
      { type: "search_library", evidence: "Search your library" },
      { type: "put_onto_battlefield", evidence: "put that card onto the battlefield" },
      { type: "shuffle_library", evidence: "then shuffle" },
    ],
  },
  {
    name: "then_exile_return_saga",
    oracleText: "Exile this Saga, then return it to the battlefield transformed under your control.",
    expectActions: [
      { type: "exile", evidence: "Exile this Saga" },
      { type: "return_to_battlefield", evidence: "return it to the battlefield" },
    ],
  },
  {
    name: "parallel_sacrifices",
    oracleText:
      "Each player loses 1 life, discards a card, sacrifices a creature of their choice, then sacrifices a land of their choice.",
    expectActions: [
      { type: "lose_life", evidence: "loses 1 life" },
      { type: "discard", evidence: "discards a card" },
      { type: "sacrifice", evidence: "sacrifices a creature" },
      { type: "sacrifice", evidence: "sacrifices a land" },
    ],
  },
  {
    name: "mill_then_exile",
    oracleText: "Target player mills four cards. Then exile each opponent's graveyard.",
    expectActions: [
      { type: "mill", evidence: "mills four cards" },
      { type: "exile", evidence: "exile each opponent" },
    ],
  },
  {
    name: "living_end_chain",
    oracleText:
      "Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield.",
    expectActions: [
      { type: "exile", evidence: "exiles all creature cards" },
      { type: "sacrifice", evidence: "sacrifices all creatures" },
      { type: "put_onto_battlefield", evidence: "puts all cards they exiled this way" },
    ],
  },
  {
    name: "discard_if_you_do_draw",
    oracleText: "Discard a card. If you do, draw two cards.",
    expectActions: [
      { type: "discard", evidence: "Discard a card" },
      { type: "draw", evidence: "draw two cards" },
    ],
  },
  {
    name: "modal_two_actions_and",
    oracleText: "Choose one —\n• Destroy target artifact.\n• Destroy target enchantment.",
    expectActions: [{ type: "destroy", evidence: "Destroy target artifact" }],
  },
  {
    name: "kodama_put_one",
    oracleText:
      "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.",
    expectActions: [
      { type: "search_library", evidence: "Search your library" },
      { type: "put_onto_battlefield", evidence: "put one onto the battlefield" },
      { type: "shuffle_library", evidence: "then shuffle" },
    ],
  },
];

const SHUFFLE_TAXONOMY_CASES = [
  {
    name: "tutor_generic_shuffle_library",
    oracleText: "Search your library for a card, put that card into your hand, then shuffle.",
    expectActions: [
      { type: "search_library", evidence: "Search your library" },
      { type: "shuffle_library", evidence: "then shuffle" },
    ],
    forbidActions: ["shuffle_into_library"],
  },
  {
    name: "jace_hand_shuffle_into_library",
    oracleText:
      "−12: Exile all cards from target player's library, then that player shuffles their hand into their library.",
    expectActions: [
      { type: "exile", evidence: "Exile all cards" },
      { type: "shuffle_into_library", evidence: "shuffles their hand into their library" },
    ],
    forbidActions: ["shuffle_library"],
  },
];

const GRANTED_ABILITY_CASES = [
  {
    name: "granted_activated_mana",
    oracleText: 'Lands you control have "{T}: Add one mana of any color."',
    expectActions: [{ type: "add_mana", evidence: "Add one mana of any color" }],
    expectGranted: true,
  },
  {
    name: "granted_triggered_destroy",
    oracleText: 'All Slivers have "When this permanent enters, destroy target artifact or enchantment."',
    expectActions: [{ type: "destroy", evidence: "destroy target artifact" }],
    expectGranted: true,
  },
  {
    name: "granted_activated_lose_life",
    oracleText: 'Enchanted land has "{T}: Target player loses 3 life."',
    expectActions: [{ type: "lose_life", evidence: "loses 3 life" }],
    expectGranted: true,
  },
  {
    name: "granted_triggered_draw",
    oracleText:
      'Enchanted creature gets +1/+1 and has "Whenever this creature deals combat damage to a player, you may draw a card."',
    expectActions: [{ type: "draw", evidence: "draw a card" }],
    expectGranted: true,
  },
  {
    name: "token_reminder_still_suppressed",
    oracleText:
      'Create a Treasure token. (It\'s an artifact with "{T}, Sacrifice this token: Add one mana of any color.")',
    expectActions: [{ type: "create_token", evidence: "Treasure token" }],
    forbidActions: ["add_mana", "sacrifice"],
  },
];

const COST_BOUNDARY_CASES = [
  {
    name: "activated_sacrifice_cost",
    oracleText: "Sacrifice a Goblin: Destroy target artifact.",
    expectActions: [{ type: "destroy", evidence: "Destroy target artifact" }],
    forbidActions: ["sacrifice"],
    expectCostAnnotation: true,
  },
  {
    name: "activated_discard_cost",
    oracleText: "{G}, {T}, Discard a creature card: Search your library for a creature card.",
    expectActions: [{ type: "search_library", evidence: "Search your library" }],
    forbidActions: ["discard"],
    expectCostAnnotation: true,
  },
  {
    name: "activated_exile_cost",
    oracleText: "{1}, Exile a card from your hand: Draw a card.",
    expectActions: [{ type: "draw", evidence: "Draw a card" }],
    forbidActions: ["exile"],
    expectCostAnnotation: true,
  },
  {
    name: "additional_sacrifice_cost",
    oracleText:
      "As an additional cost to cast this spell, sacrifice a land.\nSearch your library for up to two basic land cards, put them onto the battlefield, then shuffle.",
    expectActions: [{ type: "search_library", evidence: "Search your library" }],
    forbidActions: ["sacrifice"],
  },
  {
    name: "additional_discard_cost",
    oracleText: "As an additional cost to cast this spell, discard a card.\nDraw two cards.",
    expectActions: [{ type: "draw", evidence: "Draw two cards" }],
    forbidActions: ["discard"],
  },
  {
    name: "optional_sacrifice_effect",
    oracleText: "You may sacrifice a creature. If you do, draw two cards.",
    expectActions: [
      { type: "sacrifice", evidence: "sacrifice a creature" },
      { type: "draw", evidence: "draw two cards" },
    ],
    sacrificeRoleAt: "effect",
  },
  {
    name: "optional_discard_effect",
    oracleText: "When this creature enters, you may discard a card. If you do, draw a card.",
    expectActions: [
      { type: "discard", evidence: "discard a card" },
      { type: "draw", evidence: "draw a card" },
    ],
    discardRoleAt: "effect",
  },
  {
    name: "evoke_alternative_cost",
    oracleText: "Evoke—Exile a blue card from your hand. (You may cast this spell for its evoke cost.)\nWhen this creature enters, draw a card.",
    expectActions: [{ type: "draw", evidence: "draw a card" }],
    forbidActions: ["exile"],
  },
  {
    name: "cost_then_multiple_effects",
    oracleText: "Sacrifice a creature: Destroy target creature and draw a card.",
    expectActions: [
      { type: "destroy", evidence: "Destroy target creature" },
      { type: "draw", evidence: "draw a card" },
    ],
    forbidActions: ["sacrifice"],
    expectCostAnnotation: true,
  },
];

const STORM_REMINDER_CASES = [
  {
    name: "storm_reminder_no_cast",
    oracleText:
      "Create two 1/1 red Goblin creature tokens.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)",
    expectActions: [{ type: "create_token", evidence: "Create two 1/1 red Goblin creature tokens" }],
    forbidActions: ["cast", "copy"],
  },
];

const TOKEN_COPY_CASES = [
  {
    name: "saheeli_token_copy_not_imperative_copy",
    oracleText:
      "Choose one or both —\n• Create a token that's a copy of target artifact.\n• Create a token that's a copy of target creature, except it's an artifact in addition to its other types.",
    expectActions: [
      {
        type: "create_token",
        evidence: "Create a token that's a copy of target artifact",
        status: "accepted",
        tokenCopyOf: "target artifact",
      },
    ],
    forbidActions: ["copy"],
  },
];

const CONTEXT_DEFINED_X_CASES = [
  {
    name: "lose_x_where_defined",
    oracleText:
      "Whenever this creature attacks, each opponent loses X life and you gain X life, where X is the number of other Squirrels you control.",
    expectActions: [
      {
        type: "lose_life",
        evidence: "each opponent loses X life",
        status: "accepted",
        quantityType: "variable",
        quantitySymbol: "X",
        quantityExpression: "the number of other Squirrels you control",
      },
      {
        type: "gain_life",
        evidence: "you gain X life",
        status: "accepted",
        quantityType: "variable",
        quantitySymbol: "X",
        quantityExpression: "the number of other Squirrels you control",
      },
    ],
  },
  {
    name: "gain_x_where_defined",
    oracleText: "You gain X life, where X is the number of cards in your hand.",
    expectActions: [
      {
        type: "gain_life",
        evidence: "You gain X life",
        status: "accepted",
        quantityType: "variable",
        quantitySymbol: "X",
      },
    ],
  },
  {
    name: "deals_x_where_defined",
    oracleText: "It deals X damage to any target, where X is the number of +1/+1 counters on it.",
    expectActions: [
      {
        type: "deal_damage",
        evidence: "deals X damage",
        status: "accepted",
        quantityType: "variable",
        quantitySymbol: "X",
      },
    ],
  },
  {
    name: "draw_x_where_defined",
    oracleText: "Draw X cards, where X is the number of creatures you control.",
    expectActions: [
      {
        type: "draw",
        evidence: "Draw X cards",
        status: "accepted",
        quantityType: "variable",
        quantitySymbol: "X",
      },
    ],
  },
  {
    name: "create_x_where_defined",
    oracleText: "Create X 1/1 white Soldier creature tokens, where X is the number of artifacts you control.",
    expectActions: [
      {
        type: "create_token",
        evidence: "Create X",
        status: "accepted",
        quantityType: "variable",
        quantitySymbol: "X",
      },
    ],
  },
  {
    name: "mill_x_where_defined",
    oracleText: "Target player mills X cards, where X is the number of cards in their graveyard.",
    expectActions: [
      {
        type: "mill",
        evidence: "mills X cards",
        status: "accepted",
        quantityType: "variable",
        quantitySymbol: "X",
      },
    ],
  },
];

const VARIABLE_LOSE_LIFE_CASES = [
  {
    name: "lose_life_equal_mana_value",
    oracleText:
      "Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to that card's mana value.",
    expectActions: [
      {
        type: "lose_life",
        evidence: "You lose life equal to that card's mana value",
        quantityType: "variable",
        quantityExpression: "that card's mana value",
      },
    ],
  },
  {
    name: "lose_life_equal_power",
    oracleText: "Target creature gets -X/-X until end of turn. You lose life equal to that creature's power.",
    expectActions: [
      {
        type: "lose_life",
        evidence: "You lose life equal to that creature's power",
        quantityType: "variable",
        quantityExpression: "that creature's power",
      },
    ],
  },
  {
    name: "lose_x_life_imperative",
    oracleText: "Target player loses X life and you gain X life.",
    expectActions: [
      {
        type: "lose_life",
        evidence: "loses X life",
        quantityType: "variable",
        quantityExpression: "X",
      },
    ],
  },
  {
    name: "lose_life_equal_permanents_count",
    oracleText: "Each opponent loses life equal to the number of permanents they control.",
    expectActions: [
      {
        type: "lose_life",
        evidence: "loses life equal to the number of permanents they control",
        quantityType: "variable",
        quantityExpression: "the number of permanents they control",
      },
    ],
  },
];

function timed<T>(fn: () => T): { result: T; ms: number } {
  const start = Date.now();
  const result = fn();
  return { result, ms: Date.now() - start };
}

function testRegressionCases() {
  for (const c of [
    ...REGRESSION_HANG_CASES,
    ...COST_BOUNDARY_CASES,
    ...COMPOUND_CLAUSE_CASES,
    ...SHUFFLE_TAXONOMY_CASES,
    ...GRANTED_ABILITY_CASES,
    ...STORM_REMINDER_CASES,
    ...CONTEXT_DEFINED_X_CASES,
    ...TOKEN_COPY_CASES,
    ...VARIABLE_LOSE_LIFE_CASES,
  ]) {
    const { result, ms } = timed(() =>
      extractOracleActionsV1({ oracleId: `regression-${c.name}`, oracleText: c.oracleText }),
    );
    assert.ok(ms < PERF_BUDGET_MS, `${c.name}: parser took ${ms}ms (budget ${PERF_BUDGET_MS}ms)`);

    for (const exp of (c as { expectActions?: Array<Record<string, unknown>> }).expectActions ?? []) {
      const hit = result.actions.find(
        (a) =>
          a.actionType === exp.type &&
          a.evidenceText.toLowerCase().includes(String(exp.evidence).toLowerCase()) &&
          (!exp.status || a.reviewStatus === exp.status),
      );
      assert.ok(hit, `${c.name}: expected ${exp.status ?? "accepted"} ${exp.type} matching "${exp.evidence}"`);
      if (exp.quantityType) assert.equal(hit!.quantityType, exp.quantityType, `${c.name}: quantityType`);
      if (exp.quantitySymbol) assert.equal(hit!.quantitySymbol, exp.quantitySymbol, `${c.name}: quantitySymbol`);
      if (exp.quantityExpression) {
        assert.ok(
          hit!.quantityExpression?.includes(String(exp.quantityExpression)) ||
            hit!.quantityDefinitionSpan?.includes(String(exp.quantityExpression)),
          `${c.name}: quantityExpression`,
        );
      }
      if (exp.tokenCopyOf) {
        assert.equal(hit!.tokenCopyOf, exp.tokenCopyOf, `${c.name}: tokenCopyOf`);
      }
    }

    for (const forbid of c.forbidActions ?? []) {
      const bad = result.actions.filter((a) => a.actionType === forbid);
      assert.equal(bad.length, 0, `${c.name}: must not emit ${forbid}, got ${bad.map((a) => a.evidenceText).join("; ")}`);
    }
    for (const kind of c.expectReminderKinds ?? []) {
      assert.ok(
        result.structureAnnotations.some((a) => a.kind === kind),
        `${c.name}: expected structure annotation kind ${kind}`,
      );
    }
    if (c.expectTriggerEvent) {
      assert.ok(
        result.structureAnnotations.some((a) => a.kind === "trigger_event"),
        `${c.name}: expected trigger_event annotation`,
      );
    }
    if (c.expectCostAnnotation) {
      assert.ok(
        result.structureAnnotations.some((a) => a.kind === "cost"),
        `${c.name}: expected cost annotation`,
      );
    }
    if (c.discardRoleAt) {
      const idx = c.oracleText.toLowerCase().indexOf("discard");
      assert.ok(idx >= 0, `${c.name}: discard span missing`);
      const role = classifyTextRoleAt({ paragraph: c.oracleText, localStart: idx, localEnd: idx + 7 });
      assert.equal(role, c.discardRoleAt, `${c.name}: discard role should be ${c.discardRoleAt}, got ${role}`);
    }
    if ((c as { sacrificeRoleAt?: string }).sacrificeRoleAt) {
      const idx = c.oracleText.toLowerCase().indexOf("sacrifice");
      assert.ok(idx >= 0, `${c.name}: sacrifice span missing`);
      const role = classifyTextRoleAt({ paragraph: c.oracleText, localStart: idx, localEnd: idx + 9 });
      assert.equal(
        role,
        (c as { sacrificeRoleAt?: string }).sacrificeRoleAt,
        `${c.name}: sacrifice role should be ${(c as { sacrificeRoleAt?: string }).sacrificeRoleAt}, got ${role}`,
      );
    }
    if (c.drawRoleAt) {
      const idx = c.oracleText.toLowerCase().indexOf("draw a card");
      assert.ok(idx >= 0, `${c.name}: draw span missing`);
      const role = classifyTextRoleAt({ paragraph: c.oracleText, localStart: idx, localEnd: idx + 11 });
      if ((c as { drawRoleAuditOnly?: boolean }).drawRoleAuditOnly) {
        // Audit anchor: records misclassification until if_you_do consequent boundary is fixed
        assert.ok(["effect", "condition"].includes(role), `${c.name}: draw role unexpected: ${role}`);
      } else {
        assert.equal(role, c.drawRoleAt, `${c.name}: draw role should be ${c.drawRoleAt}, got ${role}`);
      }
    }
    if ((c as { expectGranted?: boolean }).expectGranted) {
      assert.ok(
        result.actions.every((a) => a.abilityOrigin === "granted" && a.grantedByAbilityId),
        `${c.name}: expected granted ability origin on all actions`,
      );
    }
  }
}

function testCompoundClauseNoHang() {
  const text =
    "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token.";
  const { result: spans, ms } = timed(() => compoundClauseSpansWithRoles(text));
  assert.ok(ms < 50, `compoundClauseSpansWithRoles took ${ms}ms`);
  assert.ok(spans.length >= 1);
  const { ms: roleMs } = timed(() =>
    classifyTextRoleAt({ paragraph: text, localStart: text.indexOf("create"), localEnd: text.indexOf("create") + 6 }),
  );
  assert.ok(roleMs < 50, `classifyTextRoleAt took ${roleMs}ms`);
}

function testReminderSpanDetection() {
  const text = '(Flashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.))';
  const spans = findReminderSpans(text);
  assert.ok(spans.length >= 1);
  assert.equal(spans[0].role, "mechanic_reminder");
}

function testFullDevelopmentRuntime() {
  const devPath = resolve(process.cwd(), "data/oracle-action-eval-development-v25.json");
  const dev = JSON.parse(readFileSync(devPath, "utf8")) as { cases: Array<{ id: string; oracleText: string; oracleId: string; cardFace?: string }> };
  const { ms } = timed(() => {
    for (const c of dev.cases) {
      extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
    }
  });
  assert.ok(ms < DEV_CASE_BUDGET_MS, `full dev v17 parse took ${ms}ms (budget ${DEV_CASE_BUDGET_MS}ms)`);
  return ms;
}

function main() {
  assert.match(ORACLE_ACTION_PARSER_VERSION, /v1\.22-context-defined-x-quantity-dev/);
  testRegressionCases();
  testCompoundClauseNoHang();
  testReminderSpanDetection();
  const devMs = testFullDevelopmentRuntime();
  console.log(
    JSON.stringify(
      {
        pass: true,
        parserVersion: ORACLE_ACTION_PARSER_VERSION,
        regressionCases:
          REGRESSION_HANG_CASES.length +
          COST_BOUNDARY_CASES.length +
          COMPOUND_CLAUSE_CASES.length +
          SHUFFLE_TAXONOMY_CASES.length +
          GRANTED_ABILITY_CASES.length +
          VARIABLE_LOSE_LIFE_CASES.length +
          STORM_REMINDER_CASES.length +
          CONTEXT_DEFINED_X_CASES.length +
          TOKEN_COPY_CASES.length,
        fullDevelopmentRuntimeMs: devMs,
        perfBudgetMs: PERF_BUDGET_MS,
        devBudgetMs: DEV_CASE_BUDGET_MS,
      },
      null,
      2,
    ),
  );
}

main();
