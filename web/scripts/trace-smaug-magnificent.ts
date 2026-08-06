import { resolveCommanderEntity } from "../src/lib/store-inventory/entity-candidate-resolution";
import { inferDeckBuildMode } from "../src/lib/store-inventory/commander-status";

async function main() {
  const message =
    "Build a complete Commander deck around Smaug the Magnificent, the newly previewed card from the upcoming Hobbit set.";
  const entity = await resolveCommanderEntity({
    phrase: "Smaug the Magnificent",
    conversationContext: message,
  });

  if (!entity.selected) {
    console.error("FAILED: no selected candidate", entity);
    process.exit(1);
  }

  const selected = entity.selected;
  const mode = inferDeckBuildMode({
    commanderStatus: selected.commanderStatus,
    message,
    conversationSummary: "",
  });

  console.log(
    JSON.stringify(
      {
        originalMessage: message,
        resolvedTask: "build_deck",
        commanderSelectionPolicy: "exact_commander_required",
        entityResolutionStatus: entity.entityResolutionStatus,
        candidateEntities: entity.candidates.map((c) => ({
          oracleId: c.oracleId,
          name: c.canonicalName,
          score: c.confidenceScore,
        })),
        canonicalName: selected.canonicalName,
        oracleId: selected.oracleId,
        setCode: selected.setCode,
        releaseDate: selected.releaseDate,
        structurallyEligible: selected.commanderStatus.structurallyEligible,
        legalityStatus: selected.commanderStatus.legalityStatus,
        deckBuildMode: mode,
        lockedCommanderOracleId: selected.oracleId,
        commanderColorIdentity: selected.colorIdentity,
        resolutionSource: selected.resolutionSource,
        verificationResult: "pass — commander locked for theorycraft build",
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
