import { NextRequest, NextResponse } from "next/server";
import { jsonError, handleRouteError } from "@/lib/api-utils";
import {
  parseScanIndexGameParam,
  readScanIndexManifest,
  scanIndexPackBuffer,
} from "@/lib/scan-index/host";

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
    const body = scanIndexPackBuffer(game);
    return new NextResponse(Uint8Array.from(body), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(body.length),
        "Cache-Control": "public, max-age=3600",
        "X-Scan-Index-Version": manifest.version,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
