/**
 * Adjudicate 17 validation blind-review missing-label proposals using Oracle text only.
 * Updates validation gold → validation-v2 with audit history.
 * Run: npx tsx scripts/adjudicate-validation-missing-labels.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { computeContentHash, TAXONOMY_VERSION, type ExpectedPrimitiveAction } from "./oracle-action-eval-shared";

const REVIEWER = "validation-missing-label-adjudicator";

interface AdjudicationRow {
  caseId: string;
  oracleId: string;
  cardFace?: string;
  proposedMissingPrimitive: string;
  evidenceSpan: string;
  decision: "accept_into_gold" | "reject";
  reason: string;
  reviewer: string;
}

const ADJUDICATIONS: AdjudicationRow[] = [
  {
    caseId: "held-0013",
    oracleId: "held-oracle-13",
    proposedMissingPrimitive: "play",
    evidenceSpan: "you may play that card",
    decision: "accept_into_gold",
    reason:
      "Optional play permission is a distinct primitive from exile; replaces mislabeled cast entry with play + optional:true.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0017",
    oracleId: "held-oracle-17",
    proposedMissingPrimitive: "cast",
    evidenceSpan: "Players can't cast spells from graveyards or libraries",
    decision: "reject",
    reason: "Static restriction on opponent casting — not a player-initiated cast primitive.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0019",
    oracleId: "held-oracle-19",
    proposedMissingPrimitive: "cast",
    evidenceSpan: "you may cast this spell without paying its mana cost",
    decision: "reject",
    reason: "Alternative spell cost / commander discount — cost modifier, not a cast-from-zone action.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0031",
    oracleId: "held-oracle-31",
    proposedMissingPrimitive: "exile",
    evidenceSpan: "exile target permanent an opponent controls",
    decision: "accept_into_gold",
    reason: "Emblem-granting −8 ability contains a distinct exile effect absent from gold.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0041",
    oracleId: "held-oracle-41",
    proposedMissingPrimitive: "cast",
    evidenceSpan: "When you cast this spell",
    decision: "reject",
    reason: "Triggered cast event in ability structure — not a cast-permission primitive action.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0044",
    oracleId: "held-oracle-44",
    proposedMissingPrimitive: "sacrifice",
    evidenceSpan: "Whenever you sacrifice a Clue",
    decision: "reject",
    reason: "Sacrifice appears in trigger condition; put_counter is the labeled primitive effect.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0056",
    oracleId: "held-oracle-56",
    proposedMissingPrimitive: "cast",
    evidenceSpan: "As an additional cost to cast this spell",
    decision: "reject",
    reason: "Additional cost clause — lose_life already captures the cost; not a cast permission.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0074",
    oracleId: "held-oracle-74",
    proposedMissingPrimitive: "draw",
    evidenceSpan: "Whenever an opponent draws a card",
    decision: "reject",
    reason: "Opponent draw is trigger event, not this card's draw primitive; create_token is the payoff.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0075",
    oracleId: "held-oracle-75",
    proposedMissingPrimitive: "cast",
    evidenceSpan: "can't cast spells from anywhere other than their hand",
    decision: "reject",
    reason: "Static cast restriction — no player-initiated cast primitive; empty gold is correct.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0077",
    oracleId: "held-oracle-77",
    cardFace: "back",
    proposedMissingPrimitive: "return_to_hand",
    evidenceSpan: "Return target card from a graveyard to its owner's hand",
    decision: "accept_into_gold",
    reason:
      "Back-face effect returns to hand, not battlefield; correct mislabeled return_to_battlefield → return_to_hand.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0078",
    oracleId: "held-oracle-78",
    proposedMissingPrimitive: "destroy",
    evidenceSpan: "Destroy target creature or planeswalker",
    decision: "accept_into_gold",
    reason: "Front-face destroy effect was omitted from split-card gold labels.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0098",
    oracleId: "held-oracle-98",
    proposedMissingPrimitive: "sacrifice",
    evidenceSpan: "Sacrifice this land",
    decision: "accept_into_gold",
    reason: "Activated sacrifice cost is a distinct primitive on the destroy ability line.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0099",
    oracleId: "held-oracle-99",
    proposedMissingPrimitive: "add_mana",
    evidenceSpan: "Add {C}",
    decision: "accept_into_gold",
    reason: "Mana ability on first line is oracle-supported and absent from gold.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0099",
    oracleId: "held-oracle-99",
    proposedMissingPrimitive: "sacrifice",
    evidenceSpan: "Sacrifice this land",
    decision: "accept_into_gold",
    reason: "Sacrifice cost on destroy ability line is a distinct primitive.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0100",
    oracleId: "held-oracle-100",
    proposedMissingPrimitive: "add_mana",
    evidenceSpan: "Add {C}",
    decision: "accept_into_gold",
    reason: "Mana ability on first line is oracle-supported and absent from gold.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0100",
    oracleId: "held-oracle-100",
    proposedMissingPrimitive: "sacrifice",
    evidenceSpan: "Sacrifice this land",
    decision: "accept_into_gold",
    reason: "Sacrifice cost on destroy ability line is a distinct primitive.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0101",
    oracleId: "held-oracle-101",
    proposedMissingPrimitive: "cast",
    evidenceSpan: "you may cast this spell without paying its mana cost",
    decision: "reject",
    reason: "Commander alternative cost — not a cast-from-zone primitive; counter is the spell effect.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0102",
    oracleId: "held-oracle-102",
    proposedMissingPrimitive: "cast",
    evidenceSpan: "you may cast this spell without paying its mana cost",
    decision: "reject",
    reason: "Commander alternative cost — not a cast-from-zone primitive.",
    reviewer: REVIEWER,
  },
  {
    caseId: "held-0103",
    oracleId: "held-oracle-103",
    proposedMissingPrimitive: "cast",
    evidenceSpan: "you may cast this spell without paying its mana cost",
    decision: "reject",
    reason: "Commander alternative cost — not a cast-from-zone primitive.",
    reviewer: REVIEWER,
  },
];

function hasLabel(
  actions: ExpectedPrimitiveAction[],
  actionType: string,
  evidenceContains: string,
): boolean {
  return actions.some(
    (a) =>
      a.actionType === actionType &&
      a.evidenceContains.toLowerCase().includes(evidenceContains.toLowerCase().slice(0, 20)),
  );
}

function applyAdjudications(cases: OracleActionEvalCaseV2[]): {
  cases: OracleActionEvalCaseV2[];
  changesApplied: string[];
} {
  const caseById = new Map(cases.map((c) => [c.id, { ...c, expectedPrimitiveActions: [...c.expectedPrimitiveActions] }]));
  const changesApplied: string[] = [];

  for (const row of ADJUDICATIONS) {
    if (row.decision !== "accept_into_gold") continue;
    const testCase = caseById.get(row.caseId);
    if (!testCase) continue;

    if (row.caseId === "held-0013") {
      testCase.expectedPrimitiveActions = testCase.expectedPrimitiveActions.filter(
        (a) => !(a.actionType === "cast" && a.evidenceContains.includes("play that card")),
      );
      testCase.expectedPrimitiveActions.push({
        actionType: "play",
        evidenceContains: "you may play that card",
        optional: true,
      });
      changesApplied.push(`${row.caseId}: cast→play (optional)`);
      continue;
    }

    if (row.caseId === "held-0077") {
      const idx = testCase.expectedPrimitiveActions.findIndex(
        (a) => a.actionType === "return_to_battlefield" && a.evidenceContains.includes("owner's hand"),
      );
      if (idx >= 0) {
        testCase.expectedPrimitiveActions[idx] = {
          actionType: "return_to_hand",
          evidenceContains: "Return target card from a graveyard to its owner's hand",
          cardFace: "back",
        };
        changesApplied.push(`${row.caseId}: return_to_battlefield→return_to_hand (back)`);
      }
      continue;
    }

    const label: ExpectedPrimitiveAction = {
      actionType: row.proposedMissingPrimitive as ExpectedPrimitiveAction["actionType"],
      evidenceContains: row.evidenceSpan,
    };
    if (row.cardFace) label.cardFace = row.cardFace;

    if (!hasLabel(testCase.expectedPrimitiveActions, row.proposedMissingPrimitive, row.evidenceSpan)) {
      testCase.expectedPrimitiveActions.push(label);
      changesApplied.push(`${row.caseId}: +${row.proposedMissingPrimitive}`);
    }
  }

  return { cases: [...caseById.values()], changesApplied };
}

function main() {
  const v1Path = resolve(process.cwd(), "data", "oracle-action-eval-validation-v1.json");
  const v2Path = resolve(process.cwd(), "data", "oracle-action-eval-validation-v2.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");
  const reportPath = resolve(process.cwd(), "reports", "oracle-action-validation-missing-label-adjudication.json");

  const v1 = JSON.parse(readFileSync(v1Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
  };

  const { cases: updatedCases, changesApplied } = applyAdjudications(v1.cases);
  const newHash = computeContentHash(updatedCases);
  const adjudicatedAt = new Date().toISOString();

  const acceptCount = ADJUDICATIONS.filter((a) => a.decision === "accept_into_gold").length;
  const rejectCount = ADJUDICATIONS.filter((a) => a.decision === "reject").length;

  const v2 = {
    setClassification: "validation_set_v2",
    evaluationVersion: "validation-v2",
    contentHash: newHash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: updatedCases.length,
    frozenAt: adjudicatedAt,
    usagePolicy:
      "May be used occasionally to measure generalization. Do not tune individual parser rules directly against specific cases.",
    priorClassification: "validation_set_v1",
    priorContentHash: v1.contentHash,
    adjudicationSource: "oracle-action-validation-blind-review.json",
    adjudicatedAt,
    adjudicatedMissingLabelCount: ADJUDICATIONS.length,
    acceptedIntoGoldCount: acceptCount,
    rejectedProposalCount: rejectCount,
    goldChangesApplied: changesApplied,
    cases: updatedCases,
  };

  writeFileSync(v2Path, JSON.stringify(v2, null, 2), "utf8");

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.validationSet = {
    path: "data/oracle-action-eval-validation-v2.json",
    classification: "validation_set_v2",
    contentHash: newHash,
    caseCount: updatedCases.length,
    purpose: "Occasional generalization measurement — no case-specific rule tuning",
    priorVersions: [
      {
        path: "data/oracle-action-eval-validation-v1.json",
        classification: "validation_set_v1",
        contentHash: v1.contentHash,
        supersededAt: adjudicatedAt,
        reason: "17 missing-label proposals adjudicated from blind review",
      },
    ],
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  mkdirSync(resolve(reportPath, ".."), { recursive: true });
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: adjudicatedAt,
        priorValidationHash: v1.contentHash,
        updatedValidationHash: newHash,
        proposalCount: ADJUDICATIONS.length,
        caseCount: 17,
        acceptedIntoGold: acceptCount,
        rejected: rejectCount,
        goldChangesApplied: changesApplied,
        adjudications: ADJUDICATIONS,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Adjudicated ${ADJUDICATIONS.length} proposals across 17 cases`);
  console.log(`  accepted into gold: ${acceptCount}`);
  console.log(`  rejected: ${rejectCount}`);
  console.log(`  gold changes: ${changesApplied.length}`);
  console.log(`  prior hash: ${v1.contentHash}`);
  console.log(`  new hash:   ${newHash}`);
  console.log(`  → ${v2Path}`);
  console.log(`  → ${reportPath}`);
}

main();
