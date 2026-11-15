import { readFileSync } from "node:fs";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const ids = ["eval-0150", "eval-0158", "eval-0163", "eval-0203"];
const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v18.json", "utf8"));

for (const id of ids) {
  const c = dev.cases.find((x: { id: string }) => x.id === id);
  const raw = extractOracleActionsV1({
    oracleId: c.oracleId,
    oracleText: c.oracleText,
    cardFace: c.cardFace,
  });
  const accepted = raw.actions
    .filter((a) => a.reviewStatus === "accepted")
    .map((a) => `${a.actionType}: ${a.evidenceText.slice(0, 70)}`);
  const forbidden = c.forbiddenPrimitiveActions ?? [];
  const bad = raw.actions.filter(
    (a) => a.reviewStatus === "accepted" && forbidden.includes(a.actionType),
  );
  console.log(`${id} (${c.cardName})`);
  console.log(`  accepted: ${accepted.join(" | ") || "(none)"}`);
  console.log(`  forbidden hits: ${bad.map((a) => a.actionType).join(",") || "none"}`);
}
