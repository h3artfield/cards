import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

const text =
  "Vigilance, haste\n{T}: Target opponent whose turn it is puts target nonlegendary creature card from your graveyard onto the battlefield under their control. It gains haste. Goad it. At the beginning of the next end step, exile it. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)";
const raw = extractOracleActionsV1({ oracleId: "test", oracleText: text });
console.log(
  raw.actions
    .filter((a) => a.reviewStatus === "accepted")
    .map((a) => ({
      type: a.actionType,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidence: a.evidenceText,
    })),
);
