/**
 * RC5 Pass 3 — modal bullet option routing diagnosis for vh14-0133 and vh14-0137.
 */
import { readFileSync } from "node:fs";
import { segmentAbilities } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { buildModalOptions } from "../src/lib/deck-builder/golden-catalog/oracle-action-structural-blocks";
import { parseAbilityBlock } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-ability-block";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { compoundClauseSpansWithRoles, classifyTextRoleAt } from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import { primitiveAllowedAtRole } from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import { stableAbilityId, stableOptionId } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema";
import type { Rc5RegressionPack } from "./lib/rc5-regression-scoring-v1";

const pack = JSON.parse(
  readFileSync("data/oracle-action-eval-rc5-v14-regression-v150.json", "utf8"),
) as Rc5RegressionPack;

const CASES = ["vh14-0133", "vh14-0137"];

for (const id of CASES) {
  const c = pack.actionScoringCases.find((x) => x.sourceV14CaseId === id)!;
  console.log("\n" + "=".repeat(80));
  console.log(id, c.cardName);
  console.log("=".repeat(80));
  console.log("\nFULL ORACLE:\n", c.oracleText);

  const faces = segmentCardFaces(c.oracleText);
  for (const face of faces) {
    const abilities = segmentAbilities(c.oracleId, face.faceId, face.text, face.start);
    const modalGroups = buildModalOptions(c.oracleId, face.faceId, face.text, face.start);

    console.log("\n--- MODAL GROUPS ---");
    for (const g of modalGroups) {
      console.log("choose:", g.chooseConstraints);
      for (const opt of g.options) {
        console.log(`  optionId=${opt.optionId} abilityIndex=${opt.abilityIndex}`);
        console.log(`  text: ${opt.fullOptionText}`);
        console.log(`  clauses:`, opt.clauses.map((cl) => cl.text.slice(0, 70)));
      }
    }

    console.log("\n--- SEGMENTED ABILITIES ---");
    for (const a of abilities) {
      const headerIndex = modalGroups[0]?.headerAbilityIndex ?? 0;
      const parentId = stableAbilityId(c.oracleId, face.faceId, headerIndex);
      const optOrdinal = a.modalOptionId?.match(/opt-(\d+)/)?.[1];
      const stableOptId = optOrdinal ? stableOptionId(parentId, Number(optOrdinal)) : undefined;

      console.log(`\nabilityIndex=${a.abilityIndex} type=${a.abilityType} modalOptionId=${a.modalOptionId ?? "—"}`);
      console.log(`stableOptionId=${stableOptId ?? "—"}`);
      console.log(`text: ${a.paragraphText}`);

      const block = parseAbilityBlock({
        abilityId: a.abilityId,
        paragraphText: a.paragraphText,
        paragraphStart: a.paragraphStart,
        hostAbilityType: a.abilityType,
      });
      console.log(
        "  block clauses:",
        block.clauses.map((cl) => ({ role: cl.role, text: cl.text.slice(0, 80) })),
      );

      if (a.modalOptionId && /Destroy target land/i.test(a.paragraphText)) {
        const idx = a.paragraphText.indexOf("Destroy");
        console.log(
          "  destroy role:",
          classifyTextRoleAt({
            paragraph: a.paragraphText,
            localStart: idx,
            localEnd: idx + 17,
            abilityType: a.abilityType,
          }),
          "allowed:",
          primitiveAllowedAtRole(
            classifyTextRoleAt({
              paragraph: a.paragraphText,
              localStart: idx,
              localEnd: idx + 17,
              abilityType: a.abilityType,
            }),
            "destroy",
          ),
        );
      }
    }
  }

  const parse = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText });
  const accepted = parse.actions.filter((a) => a.reviewStatus === "accepted");

  console.log("\n--- EMITTED ACTIONS (by modal option) ---");
  for (const a of accepted) {
    console.log({
      type: a.actionType,
      ev: a.provenance.actionSpan.text.slice(0, 80),
      abilityIndex: a.abilityIndex,
      modalOptionId: a.modalOptionId ?? "—",
    });
  }

  const target = c.scoringTargets[0]!;
  const hit = accepted.some(
    (a) =>
      a.actionType === target.actionType &&
      a.provenance.actionSpan.text.toLowerCase().includes(target.evidenceContains.toLowerCase().slice(0, 30)),
  );
  console.log("\nSCORING TARGET:", target.actionType, "| recovered:", hit);
  if (!hit) {
    console.log("expected evidence:", target.evidenceContains.slice(0, 100));
  }
}
