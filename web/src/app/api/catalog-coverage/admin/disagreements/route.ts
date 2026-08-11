import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { requireAdminSession } from "@/lib/admin-auth";
import {
  buildDisagreementReport,
  calibrationQuorumReached,
  listSubmittedAdjudicators,
} from "@/lib/catalog-coverage/adjudication-service";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const quorumReached = await calibrationQuorumReached();
    const adjudicators = await listSubmittedAdjudicators();
    const disagreements = quorumReached ? await buildDisagreementReport() : [];

    return jsonOk({
      quorumReached,
      adjudicators,
      disagreementCount: disagreements.length,
      disagreements,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
