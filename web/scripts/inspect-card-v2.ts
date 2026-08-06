import { loadEnvLocal } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import { dataStore } from "../src/lib/storage/data-store";

async function main() {
  loadEnvLocal();
  const card = await requireLocalFirestore("getCard", () =>
    dataStore.getCard("a9913433-d799-4bd8-867d-a7866e080668"),
  );
  if (!card) throw new Error("not found");

  const foil = card.cardFlowV2Evidence?.imageEvidence.evidenceSlots.find(
    (s) => s.field === "foil_pattern",
  );
  const locked = card.cardFlowV2Identity?.lockedIdentity;
  const snap = card.cardFlowV2Market?.snapshots[0];

  console.log(
    JSON.stringify(
      {
        name: card.detectedName,
        marketPrice: card.marketPrice,
        foilPattern: foil?.value,
        foilStatus: foil?.status,
        foilNote: foil?.note,
        v2Locked: locked?.locked,
        lockStatus: locked?.lockStatus,
        identityConfidence: locked?.confidence,
        topSuspect: card.cardFlowV2Identity?.suspects.find(
          (s) => s.suspectId === card.cardFlowV2Identity?.suspectAssessments[0]?.suspectId,
        )?.label,
        marketMode: card.cardFlowV2Market?.mode,
        shadowMedian: snap?.valueMedian,
        acceptedComps: snap?.acceptedComps.length ?? 0,
        rejectedComps: snap?.rejectedComps.slice(0, 3).map((r) => ({
          title: r.comp.title,
          reasons: r.rejectionReasons,
        })),
        auditRisk: card.cardFlowV2Audit?.riskLevel,
        auditAgreement: card.cardFlowV2Audit?.priceComparison.agreement,
        staffMessage: locked?.staffMessage?.slice(0, 200),
      },
      null,
      2,
    ),
  );
}

main();
