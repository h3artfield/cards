import { NextResponse } from "next/server";
import { scoreCommanderOptimizationV1 } from "@/lib/commander-optimization-score/v1";
import { COS_V1_EXPECTED_SHA } from "@/lib/commander-optimization-score/v1/constants";
import { unscoredCosV1 } from "@/lib/commander-optimization-score/v1/score";
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import { getDeckResolutionCatalogRuntime } from "@/lib/deck-synthesis/professor-brew-catalog-runtime-v1";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    commanderOracleIds?: string[];
    mainboard?: Array<{ oracleId?: string; name?: string; quantity?: number }>;
    legacyScore?: number | null;
  };
  if (!Array.isArray(body.commanderOracleIds) || !Array.isArray(body.mainboard)) {
    return NextResponse.json({ error: "commanderOracleIds and mainboard are required" }, { status: 400 });
  }
  try {
    const catalog = await getDeckResolutionCatalogRuntime();
    const resolveName = (name: string) => {
      const hits = catalog.byNormalizedName.get(normalizeOracleName(name));
      if (hits?.length === 1) return { oracleId: hits[0]!.oracleId, name: hits[0]!.canonicalName };
      const exact = hits?.find((c) => c.canonicalName === name);
      if (exact) return { oracleId: exact.oracleId, name: exact.canonicalName };
      return null;
    };
    const mainboard = body.mainboard.map((card) => {
      if (card.oracleId) return card;
      const hit = card.name ? resolveName(card.name) : null;
      if (!hit) return card;
      return { ...card, oracleId: hit.oracleId, name: hit.name || card.name };
    });
    const score = await scoreCommanderOptimizationV1({
      commanderOracleIds: body.commanderOracleIds,
      mainboard,
      legacyScore: body.legacyScore ?? null,
      oracleLookup: {
        resolveName,
        cardByOracleId: (oracleId) => {
          const card = catalog.byOracleId.get(oracleId);
          if (!card) return null;
          return {
            name: card.canonicalName,
            typeLine: card.typeLine,
            manaValue: card.manaValue ?? card.cmc ?? null,
            oracleText: card.oracleText ?? "",
            colorIdentity: card.colorIdentity,
          };
        },
      },
    });
    return NextResponse.json(score);
  } catch (error) {
    const message = error instanceof Error ? error.message : "COS scoring failed";
    return NextResponse.json(
      unscoredCosV1({
        hashes: COS_V1_EXPECTED_SHA,
        code: "MISSING_EXTRACTION",
        message,
        commanderIdentity: body.commanderOracleIds.filter(Boolean).sort().join("|") || null,
        legacyScore: body.legacyScore ?? null,
      }),
    );
  }
}
