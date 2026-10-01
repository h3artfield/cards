import assert from "node:assert/strict";
import type { PlanTrialV1 } from "./plan-checker-v1";
import { deckScoreFromPlan, namedLineWins, wFromPlanRate } from "./plan-score-v1";

assert.equal(wFromPlanRate(0.25), 500);
assert.equal(wFromPlanRate(0), 0);
assert.equal(wFromPlanRate(1), 999);
const forty = wFromPlanRate(0.4);
assert.ok(forty >= 610 && forty <= 630, `40% should land near 620, got ${forty}`);

function trial(seed: number, log: string[], winTurn: number | null): PlanTrialV1 {
  return {
    seed,
    mulligans: 0,
    mulliganDecisions: [],
    winTurn,
    failureReason: winTurn == null ? "cap" : null,
    winningPlan: winTurn == null ? null : "primary",
    assembled: winTurn != null,
    poison: winTurn == null ? 4 : 10,
    combatDamage: 0,
    commanderDamage: 0,
    log,
  };
}

const trials = [
  trial(0, ["T2 cast Fynn, the Fangbearer", "T7 win poison-combat"], 7),
  trial(1, ["T1 cast Moss Viper", "T2 cast Fynn, the Fangbearer", "T4 win poison-combat"], 4),
];
assert.equal(namedLineWins({ trials, requiredNames: ["Fynn, the Fangbearer", "Moss Viper"], commanderName: "Fynn, the Fangbearer" }), 1);

const scored = deckScoreFromPlan({
  bracket: 4,
  accepted: true,
  trials,
  requiredNames: ["Fynn, the Fangbearer", "Moss Viper"],
  commanderName: "Fynn, the Fangbearer",
});
assert.equal(scored.namedLineWins, 1);
assert.equal(scored.planRate, 0.5);
assert.equal(scored.display, String(4000 + scored.w!));
assert.ok(scored.w! > 500);

const withheld = deckScoreFromPlan({ bracket: 4, accepted: false, gap: "missing card" });
assert.equal(withheld.w, null);
assert.equal(withheld.display, "4");

console.log("plan score selftest passed");
