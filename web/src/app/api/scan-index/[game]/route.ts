import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { parseScanIndexGameParam, readScanIndexManifest } from "@/lib/scan-index/host";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ game: string }> },
) {
  try {
    const { game: raw } = await params;
    const game = parseScanIndexGameParam(raw);
    if (!game) return jsonError("Unknown scan game", 404);
    const manifest = readScanIndexManifest(game);
    if (!manifest) return jsonError("Scan index not built yet", 404);
    return jsonOk({
      ...manifest,
      packUrl: `/api/scan-index/${game}/pack`,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
