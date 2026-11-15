import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { segmentAbilities } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";

const minion =
  "Whenever a nontoken creature you control enters, you may pay {2}. If you do, create a token that's a copy of that creature, except it has haste and \"At the beginning of the end step, sacrifice this permanent.\"";
const kheru =
  "At the beginning of your upkeep, you may pay {2}{B}. If you do, return a creature card at random from your graveyard to the battlefield. It gains flying, trample, and haste. Exile that card at the beginning of your next end step. If it would leave the battlefield, exile it instead of putting it anywhere else.";

for (const [name, text] of [
  ["Minion", minion],
  ["Kheru", kheru],
] as const) {
  console.log("===", name, "===");
  console.log(segmentAbilities("x", "front", text).map((a) => a.paragraphText.slice(0, 80)));
  console.log(
    extractOracleActionsV1({ oracleId: "x", oracleText: text }).actions.map((a) => ({
      t: a.actionType,
      e: a.evidenceText.slice(0, 50),
      s: a.reviewStatus,
    })),
  );
}
