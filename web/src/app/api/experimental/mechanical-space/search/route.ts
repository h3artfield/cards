import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { assertMechanicalSpaceReadOnly } from "@/lib/mechanical-space/safety";
import { searchSnapshot } from "@/lib/mechanical-space/artifact-reader";
import { readJsonIfExists } from "@/lib/mechanical-space/artifact-reader";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertMechanicalSpaceReadOnly("api-search");
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const kind = url.searchParams.get("kind") ?? "cards";
    if (kind === "features") {
      const bench = readJsonIfExists<Array<{ featureId: string; name: string; positiveExamples: number }>>(
        "mechanical-supervision-v1",
        "benchmark-features.json",
      ) ?? [];
      const hits = bench.filter((f) => f.name.toLowerCase().includes(q.toLowerCase()) || f.featureId.includes(q));
      return jsonOk({ hits: hits.slice(0, 30) });
    }
    if (!q.trim()) return jsonError("q required", 400);
    return jsonOk({ hits: searchSnapshot(q, 20) });
  } catch (err) {
    return handleRouteError(err);
  }
}
