/**
 * Compulsory Rest Stage-C failure trace — before/after structural repair.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { findGrantedQuoteContexts } from "../src/lib/deck-builder/golden-catalog/oracle-granted-ability-extraction";
import { parseAbilityBlock } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-ability-block";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";
import { diagnoseGoldRegion } from "./lib/granted-pipeline-instrumentation";
import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

const CASE_ID = "granted-exp-v136-007";

function main() {
  resetRC3PromotedFamiliesToDefault();
  const c = (
    JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v136.json"), "utf8")) as {
      cases: Array<{ id: string; oracleId: string; oracleText: string; cardName?: string; benchmarkTargets: unknown[] }>;
    }
  ).cases.find((x) => x.id === CASE_ID)!;

  const goldTarget = (c.benchmarkTargets as Array<{ fullRegionSpan: { start: number; end: number; text: string } }>)[1];
  const regionDiag = diagnoseGoldRegion(c.oracleText, c.oracleId, goldTarget.fullRegionSpan);

  const grantedContexts: Array<Record<string, unknown>> = [];
  const abilityBlocks: Array<Record<string, unknown>> = [];

  for (const face of segmentCardFaces(c.oracleText)) {
    for (const ability of segmentAbilities(c.oracleId, face.faceId, face.text, face.start)) {
      const contexts = findGrantedQuoteContexts(ability.paragraphText, ability.abilityId);
      for (const ctx of contexts) {
        const nestedParagraphStart = ability.paragraphStart + ctx.innerLocalStart;
        const block = parseAbilityBlock({
          abilityId: ctx.grantedAbilityId,
          paragraphText: ctx.innerText,
          paragraphStart: nestedParagraphStart,
          hostAbilityType: ability.abilityType,
        });
        grantedContexts.push({
          grantedAbilityId: ctx.grantedAbilityId,
          innerText: ctx.innerText,
          quoteLocalStart: ctx.quoteLocalStart,
          quoteLocalEnd: ctx.quoteLocalEnd,
          cardLevelQuoteStart: ability.paragraphStart + ctx.quoteLocalStart,
          cardLevelQuoteEnd: ability.paragraphStart + ctx.quoteLocalEnd,
          grantedAbilityType: ctx.grantedAbilityType,
        });
        abilityBlocks.push({
          abilityId: block.abilityId,
          abilityType: block.abilityType,
          costRegion: block.costRegion
            ? {
                text: block.costRegion.text,
                cardLevelStart: nestedParagraphStart + block.costRegion.localStart,
                cardLevelEnd: nestedParagraphStart + block.costRegion.localEnd,
              }
            : null,
          effectRegion: block.effectRegion
            ? {
                text: block.effectRegion.text,
                cardLevelStart: nestedParagraphStart + block.effectRegion.localStart,
                cardLevelEnd: nestedParagraphStart + block.effectRegion.localEnd,
              }
            : null,
          clauseCount: block.clauses.length,
          clauses: block.clauses.map((cl) => ({
            clauseId: cl.clauseId,
            role: cl.role,
            text: cl.text,
            localStart: cl.localStart,
            localEnd: cl.localEnd,
            cardLevelStart: nestedParagraphStart + cl.localStart,
            cardLevelEnd: nestedParagraphStart + cl.localEnd,
          })),
        });
      }
    }
  }

  const native = extractClauseNativeActions({ oracleId: c.oracleId, oracleText: c.oracleText });
  const parse = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText });
  const gainLifeActions = parse.actions.filter((a) => a.actionType === "gain_life");
  const acceptedGainLife = gainLifeActions.filter((a) => a.reviewStatus === "accepted");

  const trace = {
    generatedAt: new Date().toISOString(),
    checkpoint: "compulsory-rest-stage-c-trace",
    caseId: CASE_ID,
    cardName: c.cardName,
    goldEvidence: "You gain 2 life",
    pipeline: {
      grantedRegionDetected: regionDiag.failingStage === "success",
      contextRoutedCorrectly: regionDiag.bestRoute?.contextKind === "granted_rules",
      grantedAbilityClassified: regionDiag.bestRoute?.classification === "granted_rules_ability",
      nestedAbilityBlockCreated: abilityBlocks.length > 0,
      activatedColonSegmented: abilityBlocks.some((b) => b.costRegion && b.effectRegion),
      costRegionCreated: abilityBlocks.some((b) => b.costRegion),
      effectRegionCreated: abilityBlocks.some((b) => b.effectRegion),
      effectClauseRoles: abilityBlocks.flatMap((b) =>
        (b.clauses as Array<{ role: string }>).map((cl) => cl.role),
      ),
      gainLifeCandidateCreated: gainLifeActions.length > 0,
      semanticActionCreated: acceptedGainLife.length > 0,
      evaluatorMatch: acceptedGainLife.some((a) =>
        a.provenance.actionSpan.text.toLowerCase().includes("you gain 2 life"),
      ),
    },
    costSemantics: abilityBlocks.find((b) => b.costRegion)?.costRegion ?? null,
    effectSemantics: abilityBlocks.find((b) => b.effectRegion)?.effectRegion ?? null,
    nativeGrantedAbilities: native.grantedAbilities,
    nativeActivatedAbilities: native.activatedAbilities.filter((a) => /gain 2 life/i.test(a.effectRegion.text)),
    regionDiagnosis: regionDiag,
    grantedContexts,
    abilityBlocks,
    emittedGainLifeActions: gainLifeActions.map((a) => ({
      reviewStatus: a.reviewStatus,
      actionType: a.actionType,
      executionContext: a.executionContext,
      evidenceText: a.provenance.actionSpan.text,
      evidenceStart: a.provenance.actionSpan.start,
      evidenceEnd: a.provenance.actionSpan.end,
      semanticOwner: (a as { semanticOwner?: string }).semanticOwner,
    })),
    nestedGrantedAbsoluteSpanValid:
      acceptedGainLife.length === 0
        ? null
        : acceptedGainLife.every(
            (a) =>
              a.provenance.actionSpan.start >= 0 &&
              a.provenance.actionSpan.end <= c.oracleText.length &&
              c.oracleText
                .slice(a.provenance.actionSpan.start, a.provenance.actionSpan.end)
                .toLowerCase()
                .includes("gain"),
          ),
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/compulsory-rest-stage-c-trace.json"),
    `${JSON.stringify(trace, null, 2)}\n`,
  );
  console.log(JSON.stringify(trace.pipeline, null, 2));
}

main();
