import assert from "node:assert/strict";
import { composeDeckPilotBriefV1 } from "./compose-pilot-brief-v1";

{
  const brief = composeDeckPilotBriefV1({
    commanderName: "Kozilek, the Great Distortion",
    playstyleLabel: "Balanced / Flexible",
    playstyleDetail: "Strong all-around deck with synergy.",
    primaryWinPaths: ["commander damage", "Kozilek + Ulamog"],
    earlyTips: ["Ramp hard and keep Kozilek protected."],
    midTips: ["Hold up the counter so a big spell never resolves."],
    comboNames: ["Kozilek + Ulamog", "Ugin's Binding"],
  });
  assert.match(brief, /Wins by commander damage and Kozilek \+ Ulamog/);
  assert.match(brief, /Ramp hard/);
  assert.match(brief, /Hold up the counter/);
  assert.match(brief, /Ugin's Binding/);
  assert.doesNotMatch(brief, /Strong all-around/, "win paths beat the playstyle filler");
  assert.doesNotMatch(brief, /Kozilek \+ Ulamog.*Kozilek \+ Ulamog/, "combo names already in win paths stay out");
}

{
  const brief = composeDeckPilotBriefV1({
    commanderName: "Atraxa",
    playstyleLabel: "Value / Midrange",
    playstyleDetail: "Accumulate efficient advantages and overpower the table over time.",
  });
  assert.match(brief, /Accumulate efficient advantages/);
}

console.log("compose-pilot-brief-v1 selftest: all assertions passed");
