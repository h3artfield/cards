import { NextRequest } from "next/server";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { restrictTokenCardAssetsV1 } from "@/lib/token-creator/assets-v1";
import { sanitizeTokenCardV1 } from "@/lib/token-creator/design-v1";
import { getTokenDesignV1, getTokenVersionV1, saveTokenVersionV1 } from "@/lib/token-creator/store-v1";
import { versionViewV1 } from "@/lib/token-creator/views-v1";
import { authorizeTokenCreatorV1 } from "../../authorize";

type Params = { params: Promise<{ slug: string; versionId: string }> };

/** Saves edits that apply to this one card only; `card: null` puts it back on the design. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { slug, versionId } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const version = await getTokenVersionV1(versionId);
    if (!version || version.customerId !== auth.customer.id || version.storeId !== auth.store.id) {
      return jsonError("Card not found", 404);
    }
    const body = (await req.json()) as { card?: unknown };
    let card = null;
    if (body.card) {
      const design = await getTokenDesignV1(version.designId);
      if (!design) return jsonError("Design not found", 404);
      card = restrictTokenCardAssetsV1(sanitizeTokenCardV1(body.card, version.card ?? design.card), auth.store.id, auth.customer.id);
    }
    const next = { ...version, card };
    await saveTokenVersionV1(JSON.parse(JSON.stringify(next)));
    return jsonOk({ version: versionViewV1(slug, next) });
  } catch (err) {
    return handleRouteError(err);
  }
}
