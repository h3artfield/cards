import { splitActivatedColon, parseAbilityBlock } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-ability-block";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { readFileSync } from "node:fs";

import { resolve } from "node:path";

resetRC3PromotedFamiliesToDefault();
const c = (
  JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v136.json"), "utf8")) as {
    cases: Array<{ oracleId: string; oracleText: string }>;
  }
).cases.find((x) => x.oracleId === "020225db-5623-49c2-8cdf-1ec2a05b8b0a")!;

const para = c.oracleText.split("\n").slice(1).join("\n");
console.log("host colon", splitActivatedColon(para));
console.log("host block", parseAbilityBlock({ abilityId: "test", paragraphText: para, paragraphStart: 0 }));

const native = extractClauseNativeActions({ oracleId: c.oracleId, oracleText: c.oracleText });
console.log(
  "native",
  native.actions
    .filter((a) => a.actionType === "gain_life")
    .map((a) => ({ text: a.evidenceText, start: a.evidenceStart, end: a.evidenceEnd, ctx: (a as { executionContext?: string }).executionContext })),
);
const parse = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText });
console.log(
  "parse",
  parse.actions
    .filter((a) => a.actionType === "gain_life")
    .map((a) => ({
      text: a.provenance.actionSpan.text,
      start: a.provenance.actionSpan.start,
      ctx: a.executionContext,
      src: (a as { extractionSource?: string }).extractionSource,
    })),
);
