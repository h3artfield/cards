import { NextRequest } from "next/server";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { resumeTokenGenerationIfStaleV1 } from "@/lib/token-creator/generate-v1";
import {
  deleteTokenDesignV1,
  getTokenDesignV1,
  getTokenGenerationV1,
  getTokenVersionsV1,
} from "@/lib/token-creator/store-v1";
import type { TokenGenerationV1 } from "@/lib/token-creator/types-v1";
import { designViewV1, generationViewV1, versionViewV1 } from "@/lib/token-creator/views-v1";
import { authorizeTokenCreatorV1 } from "../../authorize";

type Params = { params: Promise<{ slug: string; designId: string }> };

/** A design with every generation and version it has produced, so refresh loses nothing. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { slug, designId } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const design = await getTokenDesignV1(designId);
    if (!design || design.customerId !== auth.customer.id || design.storeId !== auth.store.id) {
      return jsonError("Design not found", 404);
    }
    const generations = (
      await Promise.all(design.generationIds.slice(-12).map((id) => getTokenGenerationV1(id)))
    ).filter((g): g is TokenGenerationV1 => Boolean(g));
    const fresh = await Promise.all(generations.map((g) => (g.status === "running" ? resumeTokenGenerationIfStaleV1(g) : g)));
    const versionIds = fresh.flatMap((g) => g.slots.flatMap((s) => s.history));
    const versions = await getTokenVersionsV1(versionIds);
    return jsonOk({
      design: designViewV1(design),
      generations: fresh.map(generationViewV1),
      versions: versions.map((v) => versionViewV1(slug, v)),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Removes the design from the customer's list. Art and any orders are kept for reprints. */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { slug, designId } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const design = await getTokenDesignV1(designId);
    if (!design || design.customerId !== auth.customer.id || design.storeId !== auth.store.id) {
      return jsonError("Design not found", 404);
    }
    await deleteTokenDesignV1(designId);
    return jsonOk({ deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
