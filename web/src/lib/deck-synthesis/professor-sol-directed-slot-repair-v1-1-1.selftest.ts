/**
 * Slot-count repair for Architect plans that don't sum to 99.
 */
import assert from "node:assert/strict";
import { repairArchitectSlotCountsV11 } from "./professor-sol-directed-architect-ingestion-v1-1";
import { evaluateArchitectIngestionGateV111 } from "./professor-sol-directed-ingestion-gate-v1-1-1";

function main() {
  const underAllocated = {
    strategicThesis: "Test thesis",
    gamePlan: { earlyGame: ["ramp"], midGame: ["value"], lateGame: ["win"] },
    winLines: [{ name: "combo", requirements: ["a"], execution: "b" }],
    constructionBudget: { nonlandSlots: 56, landSlots: 36 },
    landPlan: { target: 36, minimum: 34, maximum: 38 },
    cardRequirements: [
      { id: "ramp_package", count: 10, primaryRole: "ramp", requirements: ["mana"], preferredExamples: [] },
      { id: "value_engine", count: 20, primaryRole: "value", requirements: ["draw"], preferredExamples: [] },
      { id: "interaction_suite", count: 16, primaryRole: "removal", requirements: ["removal"], preferredExamples: [] },
      { id: "win_condition", count: 10, primaryRole: "finisher", requirements: ["win"], preferredExamples: [] },
    ],
    comboAndPowerGuardrails: { prohibitedCards: [{ name: "Test Ban", reason: "too strong" }] },
  };

  const { plan, repairs } = repairArchitectSlotCountsV11(underAllocated);
  assert.ok(repairs.length > 0, "expected repairs");
  assert.equal(Number((plan.constructionBudget as { nonlandSlots: number }).nonlandSlots), 63);
  assert.equal(Number((plan.constructionBudget as { landSlots: number }).landSlots), 36);

  const reqSum = (plan.cardRequirements as Array<{ count: number }>).reduce((s, r) => s + r.count, 0);
  assert.equal(reqSum, 63);

  const gate = evaluateArchitectIngestionGateV111(underAllocated);
  assert.equal(gate.pass, true, gate.failures.join("; "));
  assert.equal(gate.ingested.retrievalContract.nonlandSlotsRequired, 63);
  assert.equal(gate.ingested.retrievalContract.landSlotsRequired, 36);

  console.log("PASS slot-count repair — 56+36 normalized to 63+36");
  console.log("ALL PASS — professor-sol-directed-slot-repair-v1-1-1");
}

main();
