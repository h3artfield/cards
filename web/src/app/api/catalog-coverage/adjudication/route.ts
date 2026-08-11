import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  getCalibrationCards,
  saveAdjudicationDraft,
  loadAdjudicationDraft,
  getSessionInfo,
} from "@/lib/catalog-coverage/adjudication-service";
import type { UiAdjudicationDraft } from "@/lib/catalog-coverage/adjudication-types";
import { uiDraftToSemanticGold } from "@/lib/catalog-coverage/to-semantic-gold";
import { verifyAdjudicationAccessToken } from "@/lib/catalog-coverage/adjudication-access";

export async function GET(req: NextRequest) {
  try {
    const adjudicatorId = req.nextUrl.searchParams.get("adjudicatorId")?.trim();
    const oracleId = req.nextUrl.searchParams.get("oracleId")?.trim();
    if (!adjudicatorId || !oracleId) return jsonError("adjudicatorId and oracleId required");
    const draft = await loadAdjudicationDraft(adjudicatorId, oracleId);
    return jsonOk({
      draft: draft
        ? {
            uiDraft: draft.uiDraft,
            status: draft.status,
            updatedAt: draft.updatedAt,
            submittedAt: draft.submittedAt,
          }
        : null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      adjudicatorId?: string;
      oracleId?: string;
      samplePosition?: number;
      uiDraft?: UiAdjudicationDraft;
      submit?: boolean;
      accessToken?: string;
    };

    if (!body.adjudicatorId || !body.oracleId || !body.uiDraft) {
      return jsonError("adjudicatorId, oracleId, uiDraft required");
    }
    if (!verifyAdjudicationAccessToken(body.accessToken)) {
      return jsonError("Invalid or missing adjudication access token", 403);
    }

    const session = await getSessionInfo(body.adjudicatorId);
    if (!session) return jsonError("Session not found", 404);

    const cards = getCalibrationCards();
    const card = cards.find((c) => c.oracleId === body.oracleId);
    if (!card) return jsonError("Card not in active pack", 404);

    const samplePosition =
      body.samplePosition ?? cards.findIndex((c) => c.oracleId === body.oracleId) + 1;

    const semanticGold = body.submit ? uiDraftToSemanticGold({ card, draft: body.uiDraft }) : undefined;

    await saveAdjudicationDraft({
      adjudicatorId: body.adjudicatorId,
      oracleId: body.oracleId,
      samplePosition,
      card,
      uiDraft: body.uiDraft,
      semanticGold,
      status: body.submit ? "submitted" : "draft",
    });

    const updatedSession = await getSessionInfo(body.adjudicatorId);
    return jsonOk({ ok: true, session: updatedSession, submitted: Boolean(body.submit) });
  } catch (err) {
    return handleRouteError(err);
  }
}
