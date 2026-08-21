import { existsSync } from "node:fs";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { assertMechanicalSpaceReadOnly } from "@/lib/mechanical-space/safety";
import { loadSnapshotIndex, readJsonIfExists, readJsonlIfExists } from "@/lib/mechanical-space/artifact-reader";
import { mechanicalSpacePath } from "@/lib/mechanical-space/artifact-paths";
import { readFloat32File } from "@/lib/mechanical-space/float32";

export const dynamic = "force-dynamic";

type Evidence = { oracleId: string; featureId: string };
type Bench = {
  featureId: string;
  name: string;
  positiveExamples: number;
  knownNegatives: number;
  unknown: number;
};

export async function GET(request: Request) {
  try {
    assertMechanicalSpaceReadOnly("api-feature");
    const featureId = new URL(request.url).searchParams.get("featureId");
    if (!featureId) return jsonError("featureId required", 400);
    const bench = (readJsonIfExists<Bench[]>("mechanical-supervision-v1", "benchmark-features.json") ?? []).find(
      (b) => b.featureId === featureId,
    );
    if (!bench) return jsonError("feature not in benchmark set", 404);

    const index = loadSnapshotIndex();
    const byId = new Map(index.map((r) => [r.oracleId, r]));
    const positives = readJsonlIfExists<Evidence>("mechanical-supervision-v1", "evidence.jsonl")
      .filter((e) => e.featureId === featureId)
      .map((e) => ({ oracleId: e.oracleId, name: byId.get(e.oracleId)?.name ?? e.oracleId }));

    const ml = readJsonIfExists<{
      linearProbe?: { perFeature?: Array<{ featureId: string; f1?: number; precision?: number; recall?: number; ap?: number }> };
      mlp?: { perFeature?: Array<{ featureId: string; f1?: number; precision?: number; recall?: number; ap?: number }> };
    }>("mechanical-feature-ml-v1", "report.json");

    const predictedUnseen: Array<{ oracleId: string; name: string; confidence: number }> = [];
    const featureIds = readJsonIfExists<string[]>("mechanical-supervision-v1", "feature-ids.json") ?? [];
    const fi = featureIds.indexOf(featureId);
    const linPath = mechanicalSpacePath("mechanical-feature-ml-v1", "linear-scores.f32");
    const known = new Set(positives.map((p) => p.oracleId));
    if (fi >= 0 && existsSync(linPath)) {
      const lin = readFloat32File(linPath);
      const F = featureIds.length;
      for (const row of index) {
        if (known.has(row.oracleId)) continue;
        const conf = lin[row.i * F + fi] ?? 0;
        if (conf >= 0.85) predictedUnseen.push({ oracleId: row.oracleId, name: row.name, confidence: conf });
      }
      predictedUnseen.sort((a, b) => b.confidence - a.confidence);
    }

    return jsonOk({
      feature: bench,
      knownProviders: positives.slice(0, 80),
      trainingSupport: bench.positiveExamples,
      knownNegatives: bench.knownNegatives,
      unknown: bench.unknown,
      linear: ml?.linearProbe?.perFeature?.find((x) => x.featureId === featureId) ?? null,
      mlp: ml?.mlp?.perFeature?.find((x) => x.featureId === featureId) ?? null,
      highestConfidencePredictedUnseen: predictedUnseen.slice(0, 25),
      note: "Predicted unseen cards are not known positives. Inspect before treating as grounded.",
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
