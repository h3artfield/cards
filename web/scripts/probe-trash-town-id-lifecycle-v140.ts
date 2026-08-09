import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { applyRC3Transforms } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-transform";
import { buildOracleSemanticParse } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-builder";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { verifySemanticParseIntegrity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import type { RC3ActionExtensions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-extraction-metadata";

const tc = JSON.parse(
  readFileSync(resolve("data/oracle-action-eval-development-generalization-expansion-v5-v14.json"), "utf8"),
).cases.find((c: { id: string }) => c.id === "dev-exp-v5-007");

const native = extractClauseNativeActions({ oracleId: tc.oracleId, oracleText: tc.oracleText });
const v1 = extractOracleActionsV1({ oracleId: tc.oracleId, oracleText: tc.oracleText });
const rc3 = applyRC3Transforms(v1, { oracleId: tc.oracleId, oracleText: tc.oracleText });
const semantic = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText });
const preMergeSemantic = buildOracleSemanticParse(
  { ...rc3, actions: rc3.actions },
  tc.oracleText,
);

const drawActions = rc3.actions.filter((a) => a.actionType === "draw");
const invalidAction = semantic.actions.find((a) =>
  semantic.semanticValidation.issues.some((i) => i.actionId === a.actionId && i.severity === "invalid"),
);

console.log(
  JSON.stringify(
    {
      oracleText: tc.oracleText,
      segmentedAbilities: rc3.abilities.map((a) => ({
        index: a.abilityIndex,
        type: a.abilityType,
        text: a.paragraphText.slice(0, 80),
      })),
      nativeGranted: native.grantedAbilities.map((g) => ({
        grantingClauseId: g.grantingClauseId,
        quotedSpan: g.quotedSpan,
        nestedType: g.nestedAbilityBlock.abilityType,
        nestedClauses: g.nestedAbilityBlock.clauses.map((c) => ({ id: c.clauseId, role: c.role, text: c.text.slice(0, 50) })),
      })),
      nativeDrawActions: drawActions.map((a) => ({
        actionId: a.actionId,
        abilityIndex: a.abilityIndex,
        clauseId: a.clauseId,
        evidence: a.evidenceText,
        ext: {
          grantedAbilityId: (a as typeof a & RC3ActionExtensions).grantedAbilityId,
          grantingClauseId: (a as typeof a & RC3ActionExtensions).grantingClauseId,
          executionContext: (a as typeof a & RC3ActionExtensions).executionContext,
          modalOptionId: (a as typeof a & { modalOptionId?: string }).modalOptionId,
        },
      })),
      semanticAbilities: semantic.abilities.map((a) => ({
        abilityId: a.abilityId,
        type: a.abilityType,
        mechanic: a.mechanic,
        segmentAbilityIndex: a.segmentAbilityIndex,
        clauseIds: a.clauseIds,
        options: a.options?.map((o) => ({
          optionId: o.optionId,
          ordinal: o.ordinal,
          segmentAbilityIndex: o.segmentAbilityIndex,
          clauseIds: o.clauseIds,
        })),
      })),
      semanticDrawAction: semantic.actions
        .filter((a) => a.actionType === "draw")
        .map((a) => ({
          actionId: a.actionId,
          parentAbilityId: a.parentAbilityId,
          modalOptionId: a.modalOptionId,
          clauseId: a.clauseId,
          executionContext: a.executionContext,
          evidence: a.provenance.actionSpan.text,
        })),
      invalidIssues: semantic.semanticValidation.issues.filter((i) => i.severity === "invalid"),
      integrity: verifySemanticParseIntegrity(semantic, tc.oracleText),
      preMergeDraw: preMergeSemantic.actions
        .filter((a) => a.actionType === "draw")
        .map((a) => ({
          parentAbilityId: a.parentAbilityId,
          modalOptionId: a.modalOptionId,
          clauseId: a.clauseId,
        })),
    },
    null,
    2,
  ),
);
