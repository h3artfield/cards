/**
 * RC5 Pass 2 — stun reminder isolation + replacement role classification contrasts.
 * Run: cd web && npx tsx scripts/test-rc5-replacement-stun-policy-regressions.ts
 */
import assert from "node:assert/strict";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import {
  classifyTextRoleAt,
  compoundClauseSpansWithRoles,
  findReminderSpans,
} from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";

const ORACLE_ID = "test-rc5-replacement-stun";

function accepted(text: string, oracleId = ORACLE_ID) {
  return parseOracleSemanticsRC3({ oracleId, oracleText: text }).actions.filter(
    (a) => a.reviewStatus === "accepted",
  );
}

// vh14-0094 — host triggered effect + stun reminder
{
  const text =
    "When this creature enters, tap target creature an opponent controls and put a stun counter on it. (If a permanent with a stun counter would become untapped, remove one from it instead.)";
  const actions = accepted(text, "cdc7356c-9621-4420-9fda-c8b91df0ec7c");
  assert.ok(
    actions.some((a) => a.actionType === "tap" && /tap target creature an opponent controls/i.test(a.provenance.actionSpan.text)),
    "host tap effect retained",
  );
  assert.equal(
    actions.filter((a) => /remove one from it instead/i.test(a.provenance.actionSpan.text)).length,
    0,
    "stun reminder must not emit card-native L2",
  );
  const reminders = findReminderSpans(text);
  assert.ok(reminders.some((r) => r.role === "mechanic_reminder"), "stun parenthetical is mechanic_reminder");
  const spans = compoundClauseSpansWithRoles(text);
  assert.ok(spans.some((s) => s.role === "trigger_event"), "trigger header is trigger_event");
  assert.ok(spans.some((s) => s.role === "effect"), "host resolving clause is effect");
}

// vh14-0098 — attack trigger draw + stun reminder + separate untap trigger
{
  const text =
    "Ward {2}\nWhenever this creature attacks, put three stun counters on it and draw three cards. (If a permanent with a stun counter would become untapped, remove one from it instead.)\nWhenever you cast a Turtle spell, untap this creature.";
  const actions = accepted(text, "75070eaf-c931-46e5-9aa1-b849e33580c6");
  assert.ok(actions.some((a) => a.actionType === "draw" && /draw three cards/i.test(a.provenance.actionSpan.text)));
  assert.ok(actions.some((a) => a.actionType === "untap" && /untap this creature/i.test(a.provenance.actionSpan.text)));
  assert.equal(actions.filter((a) => /remove one from it instead/i.test(a.provenance.actionSpan.text)).length, 0);
}

// Genuine replacement ability — no reminder parentheses
{
  const text =
    "If a card or token would be put into a graveyard from anywhere, exile it instead.";
  const actions = accepted(text);
  assert.ok(actions.some((a) => a.actionType === "exile" && /exile it instead/i.test(a.provenance.actionSpan.text)));
  const spans = compoundClauseSpansWithRoles(text);
  assert.ok(spans.some((s) => s.role === "replacement_event"), "replacement event recognized");
  assert.ok(
    spans.some((s) => s.role === "replacement_effect" || /exile it instead/i.test(s.text)),
    "replacement resolving action span present",
  );
}

// Saga-style parenthetical is card-specific rules — must not suppress host token effect
{
  const text =
    "Flying\n(As this Saga enters and after your draw step, add a lore counter.)\nI — Create a 2/2 red Goblin Shaman creature token.";
  assert.ok(accepted(text).some((a) => a.actionType === "create_token"));
}

// Ordinary Flashback reminder must not alter host draw/discard roles
{
  const text =
    "Draw two cards, then discard two cards.\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)";
  const actions = accepted(text);
  assert.ok(actions.some((a) => a.actionType === "draw"));
  assert.ok(actions.some((a) => a.actionType === "discard"));
  assert.equal(actions.filter((a) => a.actionType === "cast").length, 0);
}

// Trigger containing "would" outside reminder — not replacement_event by keyword alone
{
  const text = "Whenever a creature you control would deal damage, it deals double that damage instead.";
  const idx = text.indexOf("would deal");
  const role = classifyTextRoleAt({ paragraph: text, localStart: idx, localEnd: idx + 10 });
  assert.notEqual(role, "replacement_event", "would in trigger condition is not replacement_event");
}

// RC7-2 — possessive graveyard replacement (vh16-0027 / vh16-0038 shared mechanism)
{
  const heist =
    "You may cast target instant or sorcery card from an opponent's graveyard without paying its mana cost. If that spell would be put into their graveyard, exile it instead.";
  const heistActions = accepted(heist, "839748e7-ccb4-421e-9626-b6d8be9390ab");
  assert.ok(
    heistActions.some((a) => a.actionType === "exile" && /^exile it instead$/i.test(a.provenance.actionSpan.text.trim())),
    "vh16-0027 replacement consequence accepted",
  );
  assert.equal(
    heistActions.filter((a) => a.actionType === "exile" && /would be put into/i.test(a.provenance.actionSpan.text)).length,
    0,
    "intercepted graveyard event must not emit as exile action",
  );
}
{
  const chandra =
    "−2: You may cast target instant or sorcery card with mana value 3 or less from your graveyard. If that spell would be put into your graveyard, exile it instead.";
  const chandraActions = accepted(chandra, "626e8acc-20da-496c-9a79-bfbf7529c01d");
  assert.ok(
    chandraActions.some((a) => a.actionType === "exile" && /^exile it instead$/i.test(a.provenance.actionSpan.text.trim())),
    "vh16-0038 loyalty replacement consequence accepted",
  );
}

console.log("test-rc5-replacement-stun-policy-regressions: all passed");
