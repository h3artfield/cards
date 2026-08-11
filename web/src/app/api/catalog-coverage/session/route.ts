import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  getProgressForAdjudicator,
  getSessionInfo,
  slugifyAdjudicatorId,
  startSession,
  calibrationQuorumReached,
  getCalibrationCards,
  CALIBRATION_BATCH_SIZE,
} from "@/lib/catalog-coverage/adjudication-service";
import {
  CATALOG_COVERAGE_CALIBRATION_BATCH_HASH,
  CATALOG_COVERAGE_SAMPLE_IDENTITY_HASH,
  CATALOG_COVERAGE_POPULATION_HASH,
  CATALOG_COVERAGE_ANNOTATION_PROTOCOL_VERSION,
} from "@/lib/catalog-coverage/adjudication-config";
import {
  isAdjudicationAccessConfigured,
  verifyAdjudicationAccessToken,
} from "@/lib/catalog-coverage/adjudication-access";

export async function GET(req: NextRequest) {
  try {
    const adjudicatorId = req.nextUrl.searchParams.get("adjudicatorId")?.trim();
    const publicMeta = {
      phase: "calibration" as const,
      cardsTotal: CALIBRATION_BATCH_SIZE,
      sampleIdentityHash: CATALOG_COVERAGE_SAMPLE_IDENTITY_HASH,
      populationHash: CATALOG_COVERAGE_POPULATION_HASH,
      calibrationBatchHash: CATALOG_COVERAGE_CALIBRATION_BATCH_HASH,
      annotationProtocolVersion: CATALOG_COVERAGE_ANNOTATION_PROTOCOL_VERSION,
      accessRequired: isAdjudicationAccessConfigured(),
      fullSampleLocked: true,
      calibrationSuspended: false,
      digitalOnlyCount: 0,
      populationFrame: "paper-eligible-v3",
    };

    if (!adjudicatorId) {
      return jsonOk({
        ...publicMeta,
        cardOracleIds: [],
        quorumReached: await calibrationQuorumReached(),
      });
    }

    const session = await getSessionInfo(adjudicatorId);
    if (!session) {
      return jsonOk({
        ...publicMeta,
        session: null,
        sessionStale: true,
        progress: Object.fromEntries(getCalibrationCards().map((c) => [c.oracleId, "pending"])),
        quorumReached: await calibrationQuorumReached(),
      });
    }
    const progress = await getProgressForAdjudicator(adjudicatorId);
    return jsonOk({ session, progress, sessionStale: false, ...publicMeta });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      displayName?: string;
      adjudicatorId?: string;
      accessToken?: string;
    };
    if (!body.displayName?.trim()) return jsonError("displayName is required");
    if (!verifyAdjudicationAccessToken(body.accessToken)) {
      return jsonError("Invalid or missing adjudication access token", 403);
    }
    const adjudicatorId = body.adjudicatorId?.trim() || slugifyAdjudicatorId(body.displayName);
    const session = await startSession({ displayName: body.displayName, adjudicatorId });
    const progress = await getProgressForAdjudicator(adjudicatorId);
    return jsonOk({ session, progress, adjudicatorId, sessionStale: false });
  } catch (err) {
    return handleRouteError(err);
  }
}
