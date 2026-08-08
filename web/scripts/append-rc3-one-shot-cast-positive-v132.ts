/**
 * Append one-shot cast positive coverage + write positive-training-v132 revision.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ONE_SHOT_CASES = [
  {
    id: "rc3-pos-one-shot-cast-0001",
    category: "rc3-positive-one_shot_cast_resolution",
    layout: "normal",
    oracleId: "e1b6d0ab-4e11-43a2-8a7f-3fb51582ddf3",
    oracleText:
      "Whenever Demilich attacks, exile up to one target instant or sorcery card from your graveyard. Copy it. You may cast the copy.",
    expectedPrimitiveActions: [
      { actionType: "exile", evidenceContains: "exile up to one target", negative: false },
      { actionType: "copy", evidenceContains: "Copy it", negative: false },
      { actionType: "cast", evidenceContains: "cast the copy", negative: false, optionalEffect: true },
    ],
    cardName: "A-Demilich (one-shot cast branch)",
    coverageStratum: "one_shot_cast_resolution",
    spentV12Regression: false,
    caseScope: "ability",
    scopeReason: "Triggered attack ability — copy then optional cast the copy.",
    certifiedEmptyLayer2: false,
    goldCompletenessStatus: "complete_within_scope",
    parserConsulted: false,
  },
  {
    id: "rc3-pos-one-shot-cast-0002",
    category: "rc3-positive-one_shot_cast_resolution",
    layout: "normal",
    oracleId: "synthetic-one-shot-cast-it",
    oracleText: "Discover. You may cast it.",
    expectedPrimitiveActions: [
      { actionType: "cast", evidenceContains: "cast it", negative: false, optionalEffect: true },
    ],
    cardName: "Synthetic Discover cast-it",
    coverageStratum: "one_shot_cast_resolution",
    spentV12Regression: false,
    caseScope: "full_card",
    scopeReason: "Synthetic one-shot resolution cast instruction.",
    certifiedEmptyLayer2: false,
    goldCompletenessStatus: "complete_within_scope",
    parserConsulted: false,
  },
];

function main() {
  const srcPath = resolve("data/oracle-action-eval-rc3-positive-training-v130.json");
  const src = JSON.parse(readFileSync(srcPath, "utf8")) as { cases: unknown[]; evaluationSetVersion: string };
  const cases = [...src.cases, ...ONE_SHOT_CASES];
  const out = {
    ...src,
    setClassification: "rc3_positive_training_v132",
    evaluationSetVersion: "rc3-positive-training-v132",
    parentPackVersion: "rc3-positive-training-v130",
    revisedAt: new Date().toISOString(),
    cases,
    contentHash: "",
  };
  out.contentHash = createHash("sha256").update(JSON.stringify(out.cases)).digest("hex");
  const outPath = resolve("data/oracle-action-eval-rc3-positive-training-v132.json");
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, added: ONE_SHOT_CASES.length, hash: out.contentHash }, null, 2));
}

main();
