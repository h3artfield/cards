/**
 * Adjudicate development missing-label proposals and create development_set_v2.
 * Preserves development_set_v1 (frozen historical) unchanged.
 * Run: npx tsx scripts/adjudicate-development-missing-labels.ts
 */
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  computeContentHash,
  evidenceMatchesOracle,
  TAXONOMY_VERSION,
  type ExpectedPrimitiveAction,
} from "./oracle-action-eval-shared";
import { OPTIONALITY_CONDITION_EVAL_CASES } from "./oracle-action-eval-optionality-condition-cases";

const REVIEWER = "development-missing-label-adjudicator";

interface Proposal {
  caseId: string;
  oracleId: string;
  cardFace?: string;
  proposedMissingPrimitive: string;
  evidenceSpan: string;
}

interface AdjudicationRow {
  caseId: string;
  oracleId: string;
  cardFace?: string;
  primitive: string;
  evidenceSpan: string;
  decision: "accept_into_gold" | "reject";
  reason: string;
  reviewer: string;
}


function adjudicateProposal(proposal: Proposal, testCase: OracleActionEvalCaseV2): AdjudicationRow {
  const p = proposal.proposedMissingPrimitive;
  const e = proposal.evidenceSpan;
  const oracle = testCase.oracleText;
  const gold = testCase.expectedPrimitiveActions.filter((x) => !x.negative);

  if (p === "cast") {
    if (/You may cast this spell from/i.test(e)) {
      return { ...proposal, primitive: p, decision: "accept_into_gold", reason: "Optional cast-from-zone permission.", reviewer: REVIEWER };
    }
    return {
      ...proposal,
      primitive: p,
      decision: "reject",
      reason: "Cast reference is a trigger event, cost modifier, or already covered by play — not a cast-from-zone primitive.",
      reviewer: REVIEWER,
    };
  }

  if (p === "search_library") {
    const existing = gold.find((g) => g.actionType === "search_library");
    if (existing && evidenceMatchesOracle(oracle, existing.evidenceContains) && evidenceMatchesOracle(e, existing.evidenceContains)) {
      return { ...proposal, primitive: p, decision: "reject", reason: "Granularity covered by existing search_library gold label.", reviewer: REVIEWER };
    }
  }

  if (p === "destroy" && gold.some((g) => g.actionType === "destroy" && g.evidenceContains === "Destroy target")) {
    if (/Destroy target (artifact|creature|enchantment|land)/i.test(e)) {
      // handled via modal policy patch on eval-0043 — accept via separate patch
    }
  }

  const { decision, reason } = { decision: "accept_into_gold" as const, reason: "Oracle-supported primitive absent from development gold labels." };
  return { ...proposal, primitive: p, decision, reason, reviewer: REVIEWER };
}

function buildLabel(proposal: Proposal, testCase: OracleActionEvalCaseV2): ExpectedPrimitiveAction {
  const label: ExpectedPrimitiveAction = {
    actionType: proposal.proposedMissingPrimitive as ExpectedPrimitiveAction["actionType"],
    evidenceContains: proposal.evidenceSpan.slice(0, 80),
  };
  if (proposal.cardFace) label.cardFace = proposal.cardFace;
  if (/\b(?:You|they|that player|its controller) may\b/i.test(proposal.evidenceSpan)) {
    label.optionalEffect = true;
    label.optional = true;
  }
  if (/\bup to (?:one|two|three|\w+) target/i.test(proposal.evidenceSpan)) {
    const m = proposal.evidenceSpan.match(/\bup to (one|two|three|\w+) target/i);
    if (m?.[1] === "one") label.targetMaximum = 1;
    else if (m?.[1] === "two") label.targetMaximum = 2;
    else if (m?.[1] === "three") label.targetMaximum = 3;
    label.quantityMayBeZero = true;
  }
  void testCase;
  return label;
}

function applyModalAndDuplicatePolicyPatches(cases: OracleActionEvalCaseV2[]): string[] {
  const patches: string[] = [];
  const byId = new Map(cases.map((c) => [c.id, c]));

  const modal = byId.get("eval-0043");
  if (modal) {
    modal.expectedPrimitiveActions = [
      { actionType: "destroy", evidenceContains: "Destroy target artifact" },
      { actionType: "destroy", evidenceContains: "Destroy target creature" },
      { actionType: "destroy", evidenceContains: "Destroy target enchantment" },
      { actionType: "destroy", evidenceContains: "Destroy target land" },
    ];
    patches.push("eval-0043: modal destroy → separate target scopes (policy: multiple actions per modal bullet)");
  }

  const aura = byId.get("eval-0047");
  if (aura) {
    aura.expectedPrimitiveActions = [
      { actionType: "draw", evidenceContains: "When this Aura enters, draw a card" },
      { actionType: "draw", evidenceContains: "Whenever this creature deals combat damage to a player, draw a card" },
    ];
    patches.push("eval-0047: two draw triggers → repeated primitive from separate abilities");
  }

  const brainstorm = byId.get("eval-0008");
  if (brainstorm && !brainstorm.expectedPrimitiveActions.length) {
    brainstorm.expectedPrimitiveActions = [{ actionType: "draw", evidenceContains: "Draw three cards" }];
    patches.push("eval-0008: +draw (Brainstorm)");
  }

  const kolaghan = byId.get("eval-0040");
  if (kolaghan && !kolaghan.expectedPrimitiveActions.some((a) => a.actionType === "deal_damage")) {
    kolaghan.expectedPrimitiveActions.push({
      actionType: "deal_damage",
      evidenceContains: "deals 2 damage to any target",
    });
    patches.push("eval-0040: +deal_damage modal mode");
  }

  return patches;
}

function main() {
  const v1Path = resolve(process.cwd(), "data", "oracle-action-eval-development-frozen.json");
  const v1ArchivePath = resolve(process.cwd(), "data", "oracle-action-eval-development-v1.json");
  const proposalsPath = resolve(process.cwd(), "reports", "oracle-action-development-missing-label-proposals.json");
  const v2Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v2.json");
  const adjudicationPath = resolve(process.cwd(), "reports", "oracle-action-development-missing-label-adjudication.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  copyFileSync(v1Path, v1ArchivePath);
  const v1 = JSON.parse(readFileSync(v1Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
  };
  const { proposals } = JSON.parse(readFileSync(proposalsPath, "utf8")) as { proposals: Proposal[] };
  const caseById = new Map(v1.cases.map((c) => [c.id, structuredClone(c)]));

  const adjudications: AdjudicationRow[] = [];
  const goldChanges: string[] = [];

  for (const proposal of proposals) {
    const testCase = caseById.get(proposal.caseId);
    if (!testCase) continue;
    const row = adjudicateProposal(proposal, testCase);
    adjudications.push(row);
    if (row.decision === "accept_into_gold") {
      const label = buildLabel(proposal, testCase);
      const exists = testCase.expectedPrimitiveActions.some(
        (a) => a.actionType === label.actionType && evidenceMatchesOracle(testCase.oracleText, label.evidenceContains),
      );
      if (!exists) {
        testCase.expectedPrimitiveActions.push(label);
        goldChanges.push(`${proposal.caseId}: +${label.actionType} "${label.evidenceContains.slice(0, 40)}"`);
      }
    }
  }

  const policyPatches = applyModalAndDuplicatePolicyPatches([...caseById.values()]);
  goldChanges.push(...policyPatches);

  const baseCases = [...caseById.values()];
  const v2Cases = [...baseCases, ...OPTIONALITY_CONDITION_EVAL_CASES];
  const v2Hash = computeContentHash(v2Cases);
  const adjudicatedAt = new Date().toISOString();

  const v2 = {
    setClassification: "development_set_v2",
    evaluationVersion: "development-v2",
    contentHash: v2Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: v2Cases.length,
    frozenAt: adjudicatedAt,
    usagePolicy: "Parser tuning set — use for development evaluation after v2 gold adjudication.",
    priorClassification: "development_set_v1",
    priorContentHash: v1.contentHash,
    priorSetPath: "data/oracle-action-eval-development-v1.json",
    historicalV1Purpose: "Historical v6 baseline comparison — do not modify",
    adjudicatedMissingLabelProposals: proposals.length,
    acceptedIntoGoldCount: adjudications.filter((a) => a.decision === "accept_into_gold").length,
    rejectedProposalCount: adjudications.filter((a) => a.decision === "reject").length,
    optionalityConditionCasesAdded: OPTIONALITY_CONDITION_EVAL_CASES.length,
    goldChangesApplied: goldChanges,
    duplicateClassificationPolicy: {
      modalChooseOneOrMore: "multiple actions with separate evidence and target scopes per bullet",
      separateAbilitiesSamePrimitive: "multiple actions — repeated primitive from another ability",
      overlappingPatternMatch: "true duplicate — semantic dedup removes",
    },
    cases: v2Cases,
  };

  writeFileSync(v2Path, JSON.stringify(v2, null, 2), "utf8");

  mkdirSync(resolve(adjudicationPath, ".."), { recursive: true });
  writeFileSync(
    adjudicationPath,
    JSON.stringify(
      {
        generatedAt: adjudicatedAt,
        priorDevelopmentHash: v1.contentHash,
        updatedDevelopmentHash: v2Hash,
        proposalCount: proposals.length,
        acceptedIntoGold: adjudications.filter((a) => a.decision === "accept_into_gold").length,
        rejected: adjudications.filter((a) => a.decision === "reject").length,
        goldChangesApplied: goldChanges,
        duplicatePolicyPatches: policyPatches,
        adjudications,
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.developmentSetV1 = {
    path: "data/oracle-action-eval-development-v1.json",
    classification: "development_set_v1",
    contentHash: v1.contentHash,
    caseCount: v1.cases.length,
    purpose: "Historical v6 comparison — frozen, do not modify",
  };
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v2.json",
    classification: "development_set_v2",
    contentHash: v2Hash,
    caseCount: v2Cases.length,
    purpose: "Parser tuning after missing-label adjudication and optionality/condition gold expansion",
    priorVersions: [
      {
        path: "data/oracle-action-eval-development-frozen.json",
        classification: "development_set_v1",
        contentHash: v1.contentHash,
        supersededAt: adjudicatedAt,
      },
    ],
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Adjudicated ${proposals.length} development missing-label proposals`);
  console.log(`  accepted: ${adjudications.filter((a) => a.decision === "accept_into_gold").length}`);
  console.log(`  rejected: ${adjudications.filter((a) => a.decision === "reject").length}`);
  console.log(`  optionality/condition cases added: ${OPTIONALITY_CONDITION_EVAL_CASES.length}`);
  console.log(`  v1 hash: ${v1.contentHash}`);
  console.log(`  v2 hash: ${v2Hash}`);
  console.log(`  → ${v2Path}`);
}

main();
