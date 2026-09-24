/**
 * RC5 Pass 1 — granted/nested action recovery contrasts.
 * Run: cd web && npx tsx scripts/test-rc5-granted-nested-policy-regressions.ts
 */
import assert from "node:assert/strict";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";

const ORACLE_ID = "test-rc5-granted-nested";

function accepted(text: string) {
  return parseOracleSemanticsRC3({ oracleId: ORACLE_ID, oracleText: text }).actions.filter(
    (a) => a.reviewStatus === "accepted",
  );
}

function assertGrantedAction(text: string, actionType: string, evidencePart: string) {
  const actions = accepted(text);
  const hit = actions.find(
    (a) =>
      a.actionType === actionType &&
      a.provenance.actionSpan.text.toLowerCase().includes(evidencePart.toLowerCase()) &&
      a.semanticOwner === "granted_object" &&
      a.executionContext === "granted_ability",
  );
  assert.ok(hit, `expected granted ${actionType} (${evidencePart})`);
}

// vh14-0083 — nested triggered draw on granted land
assertGrantedAction(
  'Landfall — Whenever a land you control enters, a random land card in your library perpetually gains "Whenever this land becomes tapped, draw a card."',
  "draw",
  "draw a card",
);

// vh14-0087 — nested activated post-colon effects (not exile cost)
{
  const text =
    'Target creature card in your graveyard perpetually gains "{1}{B}{B}, Exile this card from your graveyard: Shuffle it into its owner\'s library. Create a token that\'s a copy of it, except it\'s a 4/4 black Zombie in addition to its other types. Activate only as a sorcery."';
  assertGrantedAction(text, "shuffle_into_library", "Shuffle it into its owner's library");
  assertGrantedAction(text, "create_token", "Create a token");
  assert.equal(accepted(text).filter((a) => a.actionType === "exile").length, 0, "exile cost stays L1");
}

// vh14-0089 — nested triggered damage on granted creature
assertGrantedAction(
  'Until end of turn, target creature you control gains "When this creature dies, return it to the battlefield tapped under its owner\'s control. It deals 1 damage to each opponent."',
  "deal_damage",
  "deals 1 damage to each opponent",
);

// vh15-0009 — Commander creatures you own have (Candlekeep Sage)
assertGrantedAction(
  'Commander creatures you own have "When this creature enters or leaves the battlefield, draw a card."',
  "draw",
  "draw a card",
);

// Create tokens. They have "..." remains created_object / token_definition, not granted_object
{
  const text = 'Create two 1/1 colorless Eldrazi Scion creature tokens. They have "{T}, Sacrifice this creature: Add {C}."';
  const actions = accepted(text);
  assert.equal(
    actions.filter((a) => a.semanticOwner === "granted_object").length,
    0,
    "create tokens they have must not route through granted_object",
  );
  assert.equal(
    actions.filter((a) => a.executionContext === "granted_ability").length,
    0,
    "token definition must not invent nested granted L2 on source card",
  );
}

// Detector contrasts — ordinary effects must NOT become nested granted L2
{
  const text = "Target creature gains flying until end of turn.";
  const actions = accepted(text);
  assert.equal(
    actions.filter((a) => a.executionContext === "granted_ability").length,
    0,
    "unquoted keyword grant must not invent nested granted L2",
  );
  assert.equal(actions.filter((a) => a.actionType === "draw").length, 0);
}

{
  const text = "Target player gains 3 life.";
  const actions = accepted(text);
  assert.ok(actions.some((a) => a.actionType === "gain_life"), "gain_life resolving effect");
  assert.equal(
    actions.filter((a) => a.executionContext === "granted_ability").length,
    0,
    "gain_life must not route through granted-rules context",
  );
}

{
  const text = "Target creature perpetually gets +1/+1.";
  const actions = accepted(text);
  assert.equal(
    actions.filter((a) => a.executionContext === "granted_ability").length,
    0,
    "perpetually gets +1/+1 must not invent quoted nested ability",
  );
  assert.equal(actions.filter((a) => a.actionType === "put_counter").length, 0);
}

console.log("test-rc5-granted-nested-policy-regressions: all passed");
