import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { listScanIndexGames } from "@/lib/scan-index/host";

export async function GET() {
  try {
    const games = listScanIndexGames().map((manifest) => ({
      ...manifest,
      manifestUrl: `/api/scan-index/${manifest.game}`,
      packUrl: `/api/scan-index/${manifest.game}/pack`,
    }));
    return jsonOk({ games });
  } catch (err) {
    return handleRouteError(err);
  }
}
