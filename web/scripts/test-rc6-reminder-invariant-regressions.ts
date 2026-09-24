/**
 * RC6-0 — reminder-span scoring invariant contrasts.
 * Run: cd web && npx tsx scripts/test-rc6-reminder-invariant-regressions.ts
 */
import assert from "node:assert/strict";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { findReminderSpans } from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import { countAcceptedReminderDerivedLayer2 } from "./lib/reminder-derived-leakage-v1";

const ORACLE_ID = "test-rc6-reminder-invariant";

function accepted(text: string) {
  return parseOracleSemanticsRC3({ oracleId: ORACLE_ID, oracleText: text }).actions.filter(
    (a) => a.reviewStatus === "accepted",
  );
}

function parse(text: string) {
  return parseOracleSemanticsRC3({ oracleId: ORACLE_ID, oracleText: text });
}

// vh15-0038 — investigate reminder must not yield accepted card-native create_token
{
  const text =
    "I, III — Choose target creature. Its owner shuffles it into their library, then investigates. (They create a Clue token.)";
  const reminders = findReminderSpans(text);
  assert.ok(
    reminders.some((r) => r.role === "mechanic_reminder" && /They create a Clue token/i.test(r.text)),
    "investigate reminder parenthetical classified",
  );
  const actions = accepted(text);
  assert.equal(
    actions.filter((a) => a.actionType === "create_token").length,
    0,
    "no accepted create_token from investigate reminder",
  );
  assert.ok(
    actions.some((a) => a.actionType === "shuffle_into_library"),
    "shuffle_into_library retained",
  );
}

// vh15-0089 — cleave reminder must not yield accepted card-native cast
{
  const text =
    "Cleave {1}{U} (You may cast this spell for its cleave cost. If you do, remove the words in square brackets.)\nReturn target nonland permanent [you control] to its owner's hand.";
  const reminders = findReminderSpans(text);
  assert.ok(
    reminders.some((r) => r.role === "mechanic_reminder" && /You may cast this spell/i.test(r.text)),
    "cleave reminder classified",
  );
  const actions = accepted(text);
  assert.equal(actions.filter((a) => a.actionType === "cast").length, 0, "no accepted cast from cleave reminder");
}

// ordinary Flash reminder — no accepted L2 from reminder span
{
  const text = "Flash (You may cast this spell any time you could cast an instant.)";
  const actions = accepted(text);
  assert.equal(actions.length, 0, "ordinary flash reminder produces no accepted card-native L2");
}

// real granted quoted ability — nested draw still materializes
{
  const text =
    'Commander creatures you own have "When this creature enters or leaves the battlefield, draw a card."';
  const actions = accepted(text);
  assert.ok(
    actions.some(
      (a) =>
        a.actionType === "draw" &&
        a.semanticOwner === "granted_object" &&
        a.executionContext === "granted_ability",
    ),
    "granted nested draw preserved",
  );
}

// resolving parenthetical effect — not suppressed merely for parentheses
{
  const text = "Flying (When this creature enters the battlefield, you gain 1 life.)";
  const reminders = findReminderSpans(text);
  assert.equal(
    reminders.filter((r) => /you gain 1 life/i.test(r.text)).length,
    0,
    "non-reminder parenthetical not misclassified",
  );
  assert.ok(accepted(text).some((a) => a.actionType === "gain_life"), "gain_life from real parenthetical effect");
}

// hard invariant helper
{
  const leakText =
    "Cleave {1}{U} (You may cast this spell for its cleave cost.)\nReturn target creature to its owner's hand.";
  const parsed = parse(leakText);
  assert.equal(countAcceptedReminderDerivedLayer2(leakText, parsed.actions), 0);
}

console.log("test-rc6-reminder-invariant-regressions: all passed");
