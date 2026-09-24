import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { resolve } from "node:path";

async function main() {
  const model = JSON.parse(
    await readFile(resolve("data/milestones/mechanical-space/commander-optimization-score-v1/MODEL.json"), "utf8"),
  ) as { commanderIdentities: string[]; S: number[] };
  const pointRaw = await new Promise<string>((resolveP, reject) => {
    const chunks: Buffer[] = [];
    createReadStream(resolve("data/milestones/catalog-shadow/catalog-semantic-visualization-v1-points.json.gz"))
      .pipe(createGunzip())
      .on("data", (c) => chunks.push(c as Buffer))
      .on("end", () => resolveP(Buffer.concat(chunks).toString("utf8")))
      .on("error", reject);
  });
  const points = new Map<string, { name?: string; clusterId?: number | null; manaValue?: number | null }>();
  for (const row of JSON.parse(pointRaw) as Array<{ oracleId?: string; name?: string; clusterId?: number | null; manaValue?: number | null }>) {
    if (row.oracleId) points.set(row.oracleId, row);
  }
  const rows = model.commanderIdentities.map((identity, i) => {
    const oids = identity.split("|");
    const clusters = oids.map((id) => points.get(id)?.clusterId).filter((c): c is number => c != null);
    return {
      identity,
      S: model.S[i + 1]!,
      cluster: clusters[0] ?? null,
      name: oids.map((id) => points.get(id)?.name).filter(Boolean).join(" / "),
    };
  });
  const byCl = new Map<number, typeof rows>();
  for (const r of rows) {
    if (r.cluster == null) continue;
    const list = byCl.get(r.cluster) ?? [];
    list.push(r);
    byCl.set(r.cluster, list);
  }
  const truth: number[] = [];
  const pred: number[] = [];
  for (const r of rows) {
    if (r.cluster == null) continue;
    const peers = (byCl.get(r.cluster) ?? []).filter((p) => p.identity !== r.identity);
    if (!peers.length) continue;
    truth.push(r.S);
    pred.push(peers.reduce((s, p) => s + p.S, 0) / peers.length);
  }
  const mae = truth.reduce((s, v, i) => s + Math.abs(v - pred[i]!), 0) / truth.length;
  const mean = truth.reduce((s, v) => s + v, 0) / truth.length;
  const mt = pred.reduce((s, v) => s + v, 0) / pred.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < truth.length; i++) {
    const x = truth[i]! - mean;
    const y = pred[i]! - mt;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const sizes = [...byCl.values()].map((v) => v.length).sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        n: rows.length,
        withCluster: rows.filter((r) => r.cluster != null).length,
        looUsed: truth.length,
        clusterCount: byCl.size,
        medianClusterN: sizes[Math.floor(sizes.length / 2)],
        clusterMae: mae,
        zeroMae: truth.reduce((s, v) => s + Math.abs(v), 0) / truth.length,
        pearson: da && db ? num / Math.sqrt(da * db) : 0,
        examples: rows
          .filter((r) => /karlov|heliod|oloro|kinnan|adeline|tymna|magda|etali/i.test(r.name))
          .map((r) => ({ name: r.name, S: r.S, cluster: r.cluster })),
      },
      null,
      2,
    ),
  );
}

void main();
