/**
 * Coherence is -clusterEntropy, and entropy is computed only over cards that
 * carry a clusterId. Cards missing from the semantic artifact are backfilled
 * with clusterId: null and silently dropped from the calculation, so a deck
 * measured on few cards looks more coherent than one measured on many — and a
 * deck measured on zero or one card scores the maximum.
 *
 * This reports how much of the scoring surface actually carries cluster data.
 */
import { loadCosV1Runtime } from "@/lib/commander-optimization-score/v1/load-artifacts";

async function main(): Promise<void> {
  const runtime = await loadCosV1Runtime();
  let total = 0;
  let withCluster = 0;
  const clusterCounts = new Map<number, number>();

  for (const point of runtime.points.values()) {
    total += 1;
    if (point.clusterId != null) {
      withCluster += 1;
      const id = Number(point.clusterId);
      clusterCounts.set(id, (clusterCounts.get(id) ?? 0) + 1);
    }
  }

  const pct = total ? ((withCluster / total) * 100).toFixed(2) : "0";
  console.log(`points in artifact:      ${total}`);
  console.log(`with a clusterId:        ${withCluster} (${pct}%)`);
  console.log(`without a clusterId:     ${total - withCluster}`);
  console.log(`distinct clusters:       ${clusterCounts.size}`);
  console.log(`texts in artifact:       ${runtime.texts.size}`);

  // Entropy over k equally-sized clusters is log2(k). Showing the achievable
  // range makes it obvious how much a shrinking measured set moves the axis.
  for (const k of [1, 2, 5, 10, 20, clusterCounts.size]) {
    if (k < 1) continue;
    console.log(`  entropy ceiling at ${String(k).padStart(4)} clusters: ${Math.log2(k).toFixed(3)}  -> coherence ${(-Math.log2(k)).toFixed(3)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
