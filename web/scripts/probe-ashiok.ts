import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const t = "-1: Target player mills four cards. Then exile each opponent's graveyard.";
const r = extractOracleActionsV1({ oracleId: "t", oracleText: t });
console.log("actions", r.actions);
console.log("abilities", r.abilities);
console.log("abstained", r.abstainedClauses);
console.log("annotations", r.structureAnnotations.map((a) => a.kind + ":" + a.evidenceText.slice(0, 40)));

const t2 = "Target player mills four cards.";
const r2 = extractOracleActionsV1({ oracleId: "t", oracleText: t2 });
console.log("mills only", r2.actions.map((a) => a.actionType));

const t3 = "Then exile each opponent's graveyard.";
const r3 = extractOracleActionsV1({ oracleId: "t", oracleText: t3 });
console.log("exile only", r3.actions.map((a) => a.actionType));
