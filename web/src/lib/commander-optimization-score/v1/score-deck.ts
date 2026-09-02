import { accessFeatures, accessVector } from "./access-features";
import { architectureFromHits } from "./architecture-from-hits";
import { detectCompleteCombos } from "./detect";
import { fpVector } from "./fp-vector";
import { loadCosV1Runtime } from "./load-artifacts";
import { buildCosV1PlayerReport, cardNameMap } from "./player-report";
import { commanderIdentity, scoreFromHeadlineVector, unscoredCosV1 } from "./score";
import type { CosV1ArchitectureFingerprint, CosV1Score } from "./types";
import type { CosV1ComboRow, CosV1CompleteHit } from "./architecture-from-hits";
import { mainboardCopies, type CosV1OracleLookup } from "./universal-coverage";

function withReport(
  score: CosV1Score,
  args: {
    architecture: CosV1ArchitectureFingerprint | null;
    hits: CosV1CompleteHit[];
    comboIndex: Map<string, CosV1ComboRow>;
    names: Map<string, string>;
  },
): CosV1Score {
  return {
    ...score,
    playerReport: buildCosV1PlayerReport({
      score,
      architecture: args.architecture,
      hits: args.hits,
      comboIndex: args.comboIndex,
      names: args.names,
    }),
  };
}

export type CosV1DeckInput = {
  commanderOracleIds: string[];
  mainboard: Array<{ oracleId?: string; name?: string; quantity?: number }>;
  legacyScore?: number | null;
  oracleLookup?: CosV1OracleLookup;
};

function resolveMainboard(
  mainboard: CosV1DeckInput["mainboard"],
  lookup?: CosV1OracleLookup,
): Array<{ oracleId?: string; name?: string; quantity?: number }> {
  return mainboard.map((card) => {
    if (card.oracleId) return card;
    const name = card.name?.trim();
    if (!name || !lookup?.resolveName) return card;
    const hit = lookup.resolveName(name);
    if (!hit) return card;
    return { ...card, oracleId: hit.oracleId, name: hit.name || card.name };
  });
}

function backfillExtraction(args: {
  oracleIds: string[];
  points: Map<string, { name?: string; colorIdentity?: string[]; manaValue?: number | null; typeLine?: string; clusterId?: number | null }>;
  texts: Map<string, string>;
  lookup?: CosV1OracleLookup;
}): number {
  if (!args.lookup?.cardByOracleId) return 0;
  let filled = 0;
  for (const oracleId of args.oracleIds) {
    const hasPoint = args.points.has(oracleId);
    const hasText = args.texts.has(oracleId);
    if (hasPoint && hasText) continue;
    const facts = args.lookup.cardByOracleId(oracleId);
    if (!facts) continue;
    if (!hasPoint) {
      args.points.set(oracleId, {
        name: facts.name,
        colorIdentity: facts.colorIdentity,
        manaValue: facts.manaValue ?? null,
        typeLine: facts.typeLine,
        clusterId: null,
      });
    }
    if (!hasText && facts.oracleText) {
      args.texts.set(oracleId, facts.oracleText);
    }
    filled += 1;
  }
  return filled;
}

export async function scoreCommanderOptimizationV1(input: CosV1DeckInput): Promise<CosV1Score> {
  const runtime = await loadCosV1Runtime();
  const ident = commanderIdentity(input.commanderOracleIds);
  const resolved = resolveMainboard(input.mainboard, input.oracleLookup);
  const names = cardNameMap({
    commanderOracleIds: input.commanderOracleIds,
    mainboard: resolved,
    points: runtime.points,
  });
  const emptyHits: CosV1CompleteHit[] = [];
  const unresolved = resolved.filter((c) => !c.oracleId);
  if (unresolved.length) {
    const unresolvedNames = unresolved.map((c) => c.name?.trim() || "(unnamed card)");
    return withReport(
      {
        ...unscoredCosV1({
          hashes: runtime.hashes,
          code: "UNRESOLVED_CARDS",
          message: `${unresolved.length} card${unresolved.length === 1 ? "" : "s"} could not be resolved: ${unresolvedNames.slice(0, 8).join(", ")}${unresolvedNames.length > 8 ? "…" : ""}`,
          commanderIdentity: ident,
          legacyScore: input.legacyScore,
        }),
        failure: {
          code: "UNRESOLVED_CARDS",
          message: `${unresolved.length} card${unresolved.length === 1 ? "" : "s"} could not be resolved: ${unresolvedNames.slice(0, 8).join(", ")}${unresolvedNames.length > 8 ? "…" : ""}`,
          unresolvedNames,
        },
      },
      { architecture: null, hits: emptyHits, comboIndex: runtime.comboIndex, names },
    );
  }

  const mainboard = resolved.map((c) => ({
    oracleId: String(c.oracleId),
    quantity: Number(c.quantity || 1),
  }));
  const copies = mainboardCopies(mainboard);
  if (copies < 90) {
    return withReport(
      unscoredCosV1({
        hashes: runtime.hashes,
        code: "INCOMPLETE_DECKLIST",
        message: `Deck has ${copies} mainboard copies; COS requires a complete Commander list (≥90).`,
        commanderIdentity: ident,
        legacyScore: input.legacyScore,
      }),
      { architecture: null, hits: emptyHits, comboIndex: runtime.comboIndex, names },
    );
  }

  backfillExtraction({
    oracleIds: mainboard.map((c) => c.oracleId),
    points: runtime.points,
    texts: runtime.texts,
    lookup: input.oracleLookup,
  });

  const detected = detectCompleteCombos({
    deckOracleIds: new Set(mainboard.map((c) => c.oracleId)),
    commanderOracleIds: new Set(input.commanderOracleIds),
    compiled: runtime.compiled,
  });
  const architecture = architectureFromHits(detected.hits, runtime.comboIndex, detected.nNativeVariants);
  const access = accessFeatures({
    commanderOracleIds: input.commanderOracleIds,
    mainboard,
    points: runtime.points,
    texts: runtime.texts,
    sharedConc: architecture.sharedPieceConcentration,
  });
  return withReport(
    scoreFromHeadlineVector({
      x: [...fpVector(architecture), ...accessVector(access)],
      commanderIdentity: ident,
      model: runtime.model,
      reference: runtime.reference,
      access,
      architecture,
      hashes: runtime.hashes,
      legacyScore: input.legacyScore,
    }),
    { architecture, hits: detected.hits, comboIndex: runtime.comboIndex, names },
  );
}
