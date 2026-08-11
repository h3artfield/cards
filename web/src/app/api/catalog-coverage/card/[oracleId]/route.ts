import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  getCalibrationCards,
  getEnrichedCalibrationCard,
  getCardRulings,
  loadAdjudicationDraft,
} from "@/lib/catalog-coverage/adjudication-service";

type RouteParams = { params: Promise<{ oracleId: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { oracleId } = await params;
    const adjudicatorId = req.nextUrl.searchParams.get("adjudicatorId")?.trim();
    const allowed = getCalibrationCards().some((c) => c.oracleId === oracleId);
    if (!allowed) return jsonError("Card not in calibration pack", 404);

    const card = await getEnrichedCalibrationCard(oracleId);
    if (!card) return jsonError("Card not found", 404);

    let draft = null;
    if (adjudicatorId) {
      const row = await loadAdjudicationDraft(adjudicatorId, oracleId);
      if (row) {
        draft = {
          uiDraft: row.uiDraft,
          status: row.status,
          updatedAt: row.updatedAt,
          submittedAt: row.submittedAt,
        };
      }
    }

    return jsonOk({ card, draft });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { oracleId } = await params;
    const allowed = getCalibrationCards().some((c) => c.oracleId === oracleId);
    if (!allowed) return jsonError("Card not in calibration pack", 404);

    const body = (await req.json()) as { includeRulings?: boolean };
    if (!body.includeRulings) return jsonError("includeRulings required", 400);

    const rulings = await getCardRulings(oracleId);
    return jsonOk({ rulings });
  } catch (err) {
    return handleRouteError(err);
  }
}
