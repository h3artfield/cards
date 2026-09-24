import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

const envelope = JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-nested-stage-c-v138.json"), "utf8"));
const c = envelope.cases.find((x: { id: string }) => x.id === "granted-nested-v138-007");
const gold = c.benchmarkTargets[0].semanticAdjudication.layer2Gold[0];
const parse = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText });
const hit = parse.actions.some(
  (a) =>
    a.reviewStatus === "accepted" &&
    a.actionType === gold.actionType &&
    a.executionContext === "granted_ability" &&
    a.semanticOwner === "granted_object" &&
    a.provenance.actionSpan.text.toLowerCase().includes(gold.evidenceContains.toLowerCase().slice(0, 12)),
);
console.log(JSON.stringify({ gold, hit, actions: parse.actions.filter((a) => a.actionType === "draw") }, null, 2));
