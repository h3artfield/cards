import { existsSync } from "node:fs";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { assertMechanicalSpaceReadOnly } from "@/lib/mechanical-space/safety";
import { getSnapshotRow, readJsonIfExists, readJsonlIfExists } from "@/lib/mechanical-space/artifact-reader";
import { mechanicalSpacePath } from "@/lib/mechanical-space/artifact-paths";
import { readFloat32File } from "@/lib/mechanical-space/float32";
import { loadSemanticMapNeighbors } from "@/lib/semantic-visualization/artifact-loader";

export const dynamic = "force-dynamic";

type Evidence = { oracleId: string; featureId: string };
type Bench = { featureId: string; name: string };

export async function GET(request: Request) {
  try {
    assertMechanicalSpaceReadOnly("api-card");
    const oracleId = new URL(request.url).searchParams.get("oracleId");
    if (!oracleId) return jsonError("oracleId required", 400);
    const row = getSnapshotRow(oracleId);
    if (!row) return jsonError("card not in semantic snapshot", 404);

    const snap = readJsonIfExists<{ vectorCount: number; dimensions: number; model: string; checksum: string }>(
      "semantic-oracle-snapshot-v1",
      "manifest.json",
    );
    const featureIds = readJsonIfExists<string[]>("mechanical-supervision-v1", "feature-ids.json") ?? [];
    const bench = readJsonIfExists<Bench[]>("mechanical-supervision-v1", "benchmark-features.json") ?? [];
    const names = new Map(bench.map((b) => [b.featureId, b.name]));
    const evidence = readJsonlIfExists<Evidence>("mechanical-supervision-v1", "evidence.jsonl").filter(
      (e) => e.oracleId === oracleId,
    );

    const known = evidence.map((e) => ({
      featureId: e.featureId,
      name: names.get(e.featureId) ?? e.featureId,
      state: "KNOWN" as const,
    }));

    const predicted: Array<{ featureId: string; name: string; linear?: number; mlp?: number; state: "PREDICTED" }> = [];
    const linPath = mechanicalSpacePath("mechanical-feature-ml-v1", "linear-scores.f32");
    const mlpPath = mechanicalSpacePath("mechanical-feature-ml-v1", "mlp-scores.f32");
    if (snap && featureIds.length && existsSync(linPath)) {
      const lin = readFloat32File(linPath);
      const mlp = existsSync(mlpPath) ? readFloat32File(mlpPath) : null;
      const F = featureIds.length;
      for (let fi = 0; fi < F; fi++) {
        const linear = lin[row.i * F + fi];
        const mlpScore = mlp ? mlp[row.i * F + fi] : undefined;
        if ((linear ?? 0) >= 0.2 || (mlpScore ?? 0) >= 0.2) {
          predicted.push({
            featureId: featureIds[fi],
            name: names.get(featureIds[fi]) ?? featureIds[fi],
            linear,
            mlp: mlpScore,
            state: "PREDICTED",
          });
        }
      }
      predicted.sort((a, b) => (b.linear ?? 0) - (a.linear ?? 0));
    }

    let semanticNeighbors: Array<{ oracleId: string; distance: number }> = [];
    try {
      const neighborMap = await loadSemanticMapNeighbors();
      semanticNeighbors = (neighborMap.get(oracleId) ?? []).slice(0, 8);
    } catch {
      semanticNeighbors = [];
    }

    const candidates = readJsonlIfExists<{ cards: Array<{ oracleId: string }>; classification: string; id: string }>(
      "mechanical-novel-candidates-v1",
      "candidates.jsonl",
    ).filter((c) => c.cards?.some((card) => card.oracleId === oracleId));

    return jsonOk({
      card: row,
      embedding: snap
        ? {
            model: snap.model,
            dimensions: snap.dimensions,
            checksum: snap.checksum,
            status: "EXISTING_RC8_FEATURE_VECTOR",
          }
        : null,
      knownFeatures: known,
      predictedFeatures: predicted.slice(0, 20),
      unlabeledNote: "Features not listed as KNOWN are UNKNOWN unless predicted. Predictions are not canonical truth.",
      semanticNeighbors,
      candidateInteractions: candidates.slice(0, 12),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
