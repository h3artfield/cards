import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  autoBuildProfessorDeckV43,
  configureAndStartProfessorBrewV43,
} from "@/lib/deck-synthesis/professor-brew-auto-build-v4-3-v1";
import {
  createProfessorBrewSessionV42,
  dispatchProfessorBrewActionV42,
  getProfessorBrewSessionV42,
  listSupportedCommanderFixturesV42,
  refreshProfessorBrewSessionStockV42,
  tryResolveCommanderSelection,
} from "@/lib/deck-synthesis/professor-brew-service-v4-2-v1";
import type { BrewSessionActionV42 } from "@/lib/deck-synthesis/professor-brew-session-v4-2-v1";
import { parseProfessorBrewBracket } from "@/lib/deck-synthesis/professor-brew-bracket-v4-v1";

/** Head Professor + refinement + play report can run 10–20 min locally. */
export const maxDuration = 900;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    if (sessionId) {
      const view = await refreshProfessorBrewSessionStockV42(sessionId, slug);
      if (!view) return jsonError("Session not found", 404);
      return jsonOk(view);
    }

    return jsonOk({
      supportedFixtures: listSupportedCommanderFixturesV42(),
      modes: ["offline_replay", "live"] as const,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await params;

    const body = (await req.json()) as {
      sessionId?: string;
      create?: { mode?: "offline_replay" | "live" };
      action?: BrewSessionActionV42;
      selectCommander?: { name: string; slug: string; bracket?: number };
      configureAndStart?: {
        mode?: "offline_replay" | "live";
        commanderName: string;
        commanderSlug: string;
        bracket?: number;
        archetypeChoiceId?: string;
        archetypeIntent?: string;
        relationshipChoiceId?: string;
        relationshipLens?: string;
        relationshipIntent?: string;
      };
      autoBuild?: boolean;
    };

    if (body.configureAndStart) {
      const { slug } = await params;
      const result = await configureAndStartProfessorBrewV43({
        ...body.configureAndStart,
        storeSlug: slug,
      });
      if ("error" in result) return jsonError(result.error, 400);
      return jsonOk(result);
    }

    if (body.create) {
      const view = createProfessorBrewSessionV42({
        mode: body.create.mode ?? "offline_replay",
      });
      return jsonOk(view);
    }

    if (!body.sessionId) return jsonError("sessionId required", 400);

    if (body.autoBuild) {
      const result = await autoBuildProfessorDeckV43(body.sessionId);
      if ("error" in result) return jsonError(result.error, 404);
      return jsonOk(result);
    }

    if (body.selectCommander) {
      const bracket = parseProfessorBrewBracket(body.selectCommander.bracket);
      let result = await dispatchProfessorBrewActionV42(body.sessionId, { type: "SET_BRACKET", bracket });
      if ("error" in result) return jsonError(result.error, 404);
      const resolved = await tryResolveCommanderSelection(body.selectCommander.name, body.selectCommander.slug, bracket);
      if (!resolved.ok) return jsonError(resolved.message, 400);
      result = await dispatchProfessorBrewActionV42(body.sessionId, resolved.action);
      if ("error" in result) return jsonError(result.error, 404);
      return jsonOk(result);
    }

    if (!body.action) return jsonError("action or selectCommander required", 400);

    const result = await dispatchProfessorBrewActionV42(body.sessionId, body.action);
    if ("error" in result) return jsonError(result.error, 404);
    return jsonOk(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
