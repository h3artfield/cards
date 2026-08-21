import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { assertMechanicalSpaceReadOnly } from "@/lib/mechanical-space/safety";
import { readJsonIfExists, readJsonlIfExists } from "@/lib/mechanical-space/artifact-reader";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertMechanicalSpaceReadOnly("api-reports");
    const view = new URL(request.url).searchParams.get("view") ?? "benchmarks";
    if (view === "candidates") {
      return jsonOk({
        report: readJsonIfExists("mechanical-novel-candidates-v1", "report.json"),
        queue: readJsonIfExists("local-reviews", "queue.json"),
      });
    }
    if (view === "reconstruction") {
      return jsonOk(readJsonIfExists("mechanical-holdout-reconstruction-v1", "report.json"));
    }
    if (view === "parity") {
      return jsonOk({
        report: readJsonIfExists("mechanical-graph-parity-v1", "report.json"),
        mismatches: readJsonlIfExists("mechanical-graph-parity-v1", "mismatches.jsonl").slice(0, 40),
      });
    }
    return jsonOk(readJsonIfExists("mechanical-feature-ml-v1", "report.json"));
  } catch (err) {
    return handleRouteError(err);
  }
}
