import assert from "node:assert/strict";
import {
  bracketPowerAdjustmentV1,
  bracketPowerAppetiteV1,
} from "./professor-sol-directed-bracket-power-ranking-v1";

let n = 0;
function check(label: string, fn: () => void): void {
  fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

console.log("professor-sol-directed-bracket-power-ranking-v1 selftest");

check("brackets that allow zero Game Changers forbid them", () => {
  assert.equal(bracketPowerAppetiteV1(1).gameChangersForbidden, true);
  assert.equal(bracketPowerAppetiteV1(2).gameChangersForbidden, true);
});

check("brackets that allow Game Changers do not forbid them", () => {
  assert.equal(bracketPowerAppetiteV1(3).gameChangersForbidden, false);
  assert.equal(bracketPowerAppetiteV1(4).gameChangersForbidden, false);
  assert.equal(bracketPowerAppetiteV1(5).gameChangersForbidden, false);
});

check("a Game Changer is dropped from a bracket 2 pool rather than ranked last", () => {
  const adjustment = bracketPowerAdjustmentV1({
    appetite: bracketPowerAppetiteV1(2),
    isGameChanger: true,
    playRate: 0.4,
  });
  assert.equal(adjustment.excluded, true);
  assert.equal(adjustment.bonus, 0);
});

check("a Game Changer is rewarded at bracket 4 and more than at bracket 3", () => {
  const atThree = bracketPowerAdjustmentV1({
    appetite: bracketPowerAppetiteV1(3),
    isGameChanger: true,
    playRate: null,
  });
  const atFour = bracketPowerAdjustmentV1({
    appetite: bracketPowerAppetiteV1(4),
    isGameChanger: true,
    playRate: null,
  });
  assert.equal(atThree.excluded, false);
  assert.ok(atThree.bonus > 0, "bracket 3 should reward a Game Changer");
  assert.ok(atFour.bonus > atThree.bonus, "bracket 4 should reward it more than bracket 3");
});

check("play rate matters more as the requested bracket rises", () => {
  const bonusAt = (bracket: 2 | 3 | 4 | 5) =>
    bracketPowerAdjustmentV1({
      appetite: bracketPowerAppetiteV1(bracket),
      isGameChanger: false,
      playRate: 0.25,
    }).bonus;
  assert.ok(bonusAt(2) < bonusAt(3));
  assert.ok(bonusAt(3) < bonusAt(4));
  assert.ok(bonusAt(4) < bonusAt(5));
});

check("an unmeasured card is neither rewarded nor penalised", () => {
  for (const playRate of [null, 0, Number.NaN]) {
    const adjustment = bracketPowerAdjustmentV1({
      appetite: bracketPowerAppetiteV1(4),
      isGameChanger: false,
      playRate,
    });
    assert.equal(adjustment.excluded, false);
    assert.equal(adjustment.bonus, 0, `play rate ${String(playRate)} should be neutral`);
  }
});

check("a more-played card outranks a less-played one at the same bracket", () => {
  const appetite = bracketPowerAppetiteV1(4);
  const common = bracketPowerAdjustmentV1({ appetite, isGameChanger: false, playRate: 0.5 });
  const fringe = bracketPowerAdjustmentV1({ appetite, isGameChanger: false, playRate: 0.02 });
  assert.ok(common.bonus > fringe.bonus);
});

check("a play rate above 1 cannot inflate the bonus past its weight", () => {
  const appetite = bracketPowerAppetiteV1(4);
  const capped = bracketPowerAdjustmentV1({ appetite, isGameChanger: false, playRate: 5 });
  assert.equal(capped.bonus, appetite.playRateWeight);
});

check("the bonus stays small enough to be a tiebreaker, not an override", () => {
  // Requirement expansion passes treat 16 as a strong functional score, so a
  // non-Game-Changer power bonus must not dwarf that band.
  const appetite = bracketPowerAppetiteV1(4);
  const best = bracketPowerAdjustmentV1({ appetite, isGameChanger: false, playRate: 1 });
  assert.ok(best.bonus <= 32, `expected a bounded bonus, got ${best.bonus}`);
});

console.log(
  `\nprofessor-sol-directed-bracket-power-ranking-v1 selftest passed (${n} checks)`,
);
