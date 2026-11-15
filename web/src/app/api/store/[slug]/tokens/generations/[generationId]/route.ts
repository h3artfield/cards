import { NextRequest } from "next/server";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { requeueTokenSlotsV1, resumeTokenGenerationIfStaleV1 } from "@/lib/token-creator/generate-v1";
import { getTokenGenerationV1, getTokenVersionsV1 } from "@/lib/token-creator/store-v1";
import { generationViewV1, versionViewV1 } from "@/lib/token-creator/views-v1";
import { authorizeTokenCreatorV1 } from "../../authorize";

type Params = { params: Promise<{ slug: string; generationId: string }> };

export const maxDuration = 300;

async function load(req: NextRequest, slug: string, generationId: string) {
  const auth = await authorizeTokenCreatorV1(req, slug);
  if (auth.error) return { error: auth.error };
  const generation = await getTokenGenerationV1(generationId);
  if (!generation || generation.customerId !== auth.customer.id || generation.storeId !== auth.store.id) {
    return { error: jsonError("Generation not found", 404) };
  }
  return { generation };
}

/** Progress for each of the four slots, plus every finished version. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { slug, generationId } = await params;
    const loaded = await load(req, slug, generationId);
    if (loaded.error) return loaded.error;
    const generation = await resumeTokenGenerationIfStaleV1(loaded.generation);
    const versions = await getTokenVersionsV1(generation.slots.flatMap((s) => s.history));
    return jsonOk({ generation: generationViewV1(generation), versions: versions.map((v) => versionViewV1(slug, v)) });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** `{ action: "retry" }` re-runs failed slots; `{ action: "regenerate", slots: [i] }` makes new art for a slot. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { slug, generationId } = await params;
    const loaded = await load(req, slug, generationId);
    if (loaded.error) return loaded.error;
    const body = (await req.json()) as { action?: unknown; slots?: unknown };
    const mode = body.action === "regenerate" ? "regenerate" : "retry";
    const slots = Array.isArray(body.slots)
      ? body.slots.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < 4)
      : loaded.generation.slots.map((s) => s.slotIndex);
    const result = await requeueTokenSlotsV1({ generation: loaded.generation, slotIndexes: slots, mode });
    if (!result.ok) return jsonError(result.message, result.status);
    return jsonOk({ generation: generationViewV1(result.generation), remainingToday: result.remainingToday });
  } catch (err) {
    return handleRouteError(err);
  }
}
