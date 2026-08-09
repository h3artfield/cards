/**
 * Cast policy regressions — one-shot vs persistent vs trigger-event.
 * Run: cd web && npx tsx scripts/test-rc3-cast-policy-regressions.ts
 */
import assert from "node:assert/strict";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { classifyTextRoleAt } from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";

function accepted(text: string) {
  return parseOracleSemanticsRC3({ oracleId: "test-cast-policy", oracleText: text }).actions.filter(
    (a) => a.reviewStatus === "accepted",
  );
}

function roleAt(text: string, evidence: string) {
  const idx = text.indexOf(evidence);
  assert.ok(idx >= 0, `evidence not found: ${evidence}`);
  return classifyTextRoleAt({
    paragraph: text,
    localStart: idx,
    localEnd: idx + evidence.length,
  });
}

{
  const text = "Copy it. You may cast the copy.";
  const actions = accepted(text);
  const cast = actions.find((a) => a.actionType === "cast");
  assert.ok(cast, "one-shot cast the copy must emit cast");
  assert.equal(cast?.optionalEffect, true, "one-shot cast must have optionalEffect=true");
  assert.ok(actions.some((a) => a.actionType === "copy"), "copy action must emit");
}

{
  const text = "You may cast spells from your graveyard.";
  assert.equal(accepted(text).filter((a) => a.actionType === "cast").length, 0);
  assert.equal(roleAt(text, "You may cast spells from your graveyard"), "static_permission");
}

{
  const text = "You may cast spells from your hand without paying their mana costs.";
  assert.equal(accepted(text).filter((a) => a.actionType === "cast").length, 0);
  assert.equal(roleAt(text, "You may cast spells from your hand"), "static_permission");
}

{
  const text =
    "Until end of turn, you may play lands and cast spells from your graveyard.\nIf a card would be put into your graveyard from anywhere this turn, exile that card instead.";
  const actions = accepted(text);
  assert.equal(actions.filter((a) => a.actionType === "cast").length, 0);
  assert.equal(actions.filter((a) => a.actionType === "play").length, 0);
  assert.equal(roleAt(text, "you may play lands"), "static_permission");
}

{
  const text =
    "You may cast Demilich from your graveyard by exiling four instant and/or sorcery cards from your graveyard in addition to paying its other costs.";
  assert.equal(accepted(text).filter((a) => a.actionType === "cast").length, 0);
  assert.equal(roleAt(text, "You may cast Demilich from your graveyard"), "static_permission");
}

{
  const text = "Whenever you cast a spell, draw a card.";
  assert.equal(
    accepted(text).filter((a) => a.actionType === "cast" && /Whenever you cast/i.test(a.provenance.actionSpan.text)).length,
    0,
  );
  assert.equal(roleAt(text, "Whenever you cast a spell"), "trigger_event");
  assert.ok(accepted(text).some((a) => a.actionType === "draw"));
}

{
  const text =
    "Whenever Demilich attacks, exile up to one target instant or sorcery card from your graveyard. Copy it. You may cast the copy.\nYou may cast Demilich from your graveyard by exiling four instant and/or sorcery cards from your graveyard in addition to paying its other costs.";
  const actions = accepted(text);
  assert.equal(actions.filter((a) => a.actionType === "cast" && /cast the copy/i.test(a.provenance.actionSpan.text)).length, 1);
  assert.equal(actions.filter((a) => a.actionType === "cast" && /cast Demilich from your graveyard/i.test(a.provenance.actionSpan.text)).length, 0);
}

{
  const text =
    "You may cast that card for as long as it remains exiled.";
  assert.equal(accepted(text).filter((a) => a.actionType === "cast").length, 0);
  assert.equal(roleAt(text, "You may cast that card for as long as it remains exiled"), "static_permission");
}

{
  const text =
    "{1}, Exile Glamorous Outlaw from your hand: Target land gains \"{T}: Add {U}\" until Glamorous Outlaw is cast from exile. You may cast Glamorous Outlaw for as long as it remains exiled.";
  assert.equal(accepted(text).filter((a) => a.actionType === "cast").length, 0);
  assert.equal(roleAt(text, "You may cast Glamorous Outlaw for as long as it remains exiled"), "static_permission");
  assert.equal(roleAt(text, "until Glamorous Outlaw is cast from exile"), "effect");
}

{
  const text = "You may cast that card.";
  const actions = accepted(text);
  assert.equal(actions.filter((a) => a.actionType === "cast").length, 1);
}

console.log("test-rc3-cast-policy-regressions: all passed");
