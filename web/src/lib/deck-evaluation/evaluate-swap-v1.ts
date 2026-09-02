import type { DeckResolutionCatalog } from "../../scripts/lib/load-deck-resolution-catalog";
import type { CommanderGameChangerSnapshot } from "../commander-strategy/model-c/game-changer-snapshot-v1";
import type { ShadowSemanticIndex } from "../commander-strategy/shadow-semantic-index";
import type { NormalizedDeckInstance } from "../commander-strategy/types";
import { evaluateDeck } from "./evaluate-deck-v1";
import { applySwapToDeck } from "./normalize-deck-input-v1";
import type { EvaluateSwapInput, SwapEvaluationReport } from "./types";

export function evaluateSwap(input: {
  request: EvaluateSwapInput;
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
  gameChangerSnapshot: CommanderGameChangerSnapshot;
}): SwapEvaluationReport {
  const before = evaluateDeck({
    deck: input.request.deck,
    catalog: input.catalog,
    shadowIndex: input.shadowIndex,
    gameChangerSnapshot: input.gameChangerSnapshot,
    options: input.request.options,
  });

  const afterDeck = applySwapToDeck({
    deck: input.request.deck,
    removeOracleId: input.request.removeOracleId,
    addOracleId: input.request.addOracleId,
    catalog: input.catalog,
  });

  const after = evaluateDeck({
    deck: afterDeck,
    catalog: input.catalog,
    shadowIndex: input.shadowIndex,
    gameChangerSnapshot: input.gameChangerSnapshot,
    options: input.request.options,
  });

  const beforeDim = new Map(before.descriptive.dimensions.map((d) => [d.id, d]));
  const afterDim = new Map(after.descriptive.dimensions.map((d) => [d.id, d]));
  const dimensionIds = new Set([...beforeDim.keys(), ...afterDim.keys()]);
  const mechanicalProfile = [...dimensionIds].map((id) => {
    const b = beforeDim.get(id);
    const a = afterDim.get(id);
    const beforeVal = b?.value ?? 0;
    const afterVal = a?.value ?? 0;
    return {
      dimensionId: id,
      label: a?.label ?? b?.label ?? id,
      before: beforeVal,
      after: afterVal,
      delta: afterVal - beforeVal,
    };
  });

  const mbBefore = new Set(Object.keys(before.descriptive.zoneProfiles.mainboard));
  const mbAfter = new Set(Object.keys(after.descriptive.zoneProfiles.mainboard));
  const cmdBefore = new Set(Object.keys(before.descriptive.zoneProfiles.commandZone));
  const cmdAfter = new Set(Object.keys(after.descriptive.zoneProfiles.commandZone));

  const contributionsRemoved = before.descriptive.cardContributions.filter(
    (c) => c.oracleId === input.request.removeOracleId,
  );
  const contributionsAdded = after.descriptive.cardContributions.filter(
    (c) => c.oracleId === input.request.addOracleId,
  );

  const explanation: SwapEvaluationReport["explanation"] = [];
  for (const dim of mechanicalProfile.filter((d) => Math.abs(d.delta) > 1e-6).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8)) {
    explanation.push({
      kind: "dimension_shift",
      message: `${dim.label}: ${dim.before.toFixed(4)} → ${dim.after.toFixed(4)} (Δ ${dim.delta >= 0 ? "+" : ""}${dim.delta.toFixed(4)})`,
      dimensionId: dim.dimensionId,
    });
  }
  explanation.push({
    kind: "card_removed",
    message: `Removed ${input.request.removeOracleId}`,
    evidenceRefs: contributionsRemoved.flatMap((c) => c.evidenceRefs).slice(0, 5),
  });
  explanation.push({
    kind: "card_added",
    message: `Added ${input.request.addOracleId}`,
    evidenceRefs: contributionsAdded.flatMap((c) => c.evidenceRefs).slice(0, 5),
  });

  const mainboardCount = (deck: NormalizedDeckInstance) =>
    deck.mainboard.reduce((s, c) => s + c.quantity, 0);

  return {
    meta: {
      engineVersion: "deck-evaluation-engine-v1",
      generatedAt: new Date().toISOString(),
      removeOracleId: input.request.removeOracleId,
      addOracleId: input.request.addOracleId,
    },
    before,
    after,
    delta: {
      mechanicalProfile,
      zoneProfiles: {
        mainboardKeysChanged: [...mbBefore].filter((k) => (before.descriptive.zoneProfiles.mainboard[k] ?? 0) !== (after.descriptive.zoneProfiles.mainboard[k] ?? 0)),
        commandZoneKeysChanged: [...cmdBefore].filter((k) => (before.descriptive.zoneProfiles.commandZone[k] ?? 0) !== (after.descriptive.zoneProfiles.commandZone[k] ?? 0)),
      },
      structuralChanges: {
        mainboardCountBefore: mainboardCount(input.request.deck),
        mainboardCountAfter: mainboardCount(afterDeck),
        gameChangerCountBefore: before.descriptive.structuralSupplements.gameChangerAudit.gameChangerCountTotal,
        gameChangerCountAfter: after.descriptive.structuralSupplements.gameChangerAudit.gameChangerCountTotal,
      },
      contributionsAdded,
      contributionsRemoved,
    },
    explanation,
  };
}
