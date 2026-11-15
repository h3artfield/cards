#!/usr/bin/env npx tsx
/** Semantic runtime snapshot author — reads fixture catalog ONLY, never adjudication. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CaseSemanticFixture } from "./lib/phase6a1-semantic-fixture-templates-v3";

const OUT = resolve("data/milestones/deck-synthesis");
const FIXTURE_CATALOG = resolve(OUT, "phase6a1-professor-plan-semantic-fixture-catalog-v3");

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function enrichResourceGraph(snapshot: ReturnType<typeof fixtureToRuntimeSnapshot>) {
  for (const lensKey of Object.keys(snapshot.lenses) as Array<keyof typeof snapshot.lenses>) {
    const lens = snapshot.lenses[lensKey];
    const originalResourceEdges = lens.resourceGraph.edges.filter(
      (e) => !lens.validatedPackages.some((p) => p.packageRefId === e.fromNodeId || p.packageRefId === e.toNodeId),
    );
    lens.resourceGraph.edges = [];
    const nodeIds = new Set(lens.resourceGraph.nodes.map((n) => n.nodeId));
    const ensureNode = (nodeId: string, label?: string) => {
      if (!nodeIds.has(nodeId)) {
        lens.resourceGraph.nodes.push({ nodeId, kind: "resource", label: label ?? nodeId, zone: "battlefield" });
        nodeIds.add(nodeId);
      }
    };
    for (const pkg of [...lens.validatedPackages, ...lens.rejectedPackages]) {
      ensureNode(pkg.packageRefId, pkg.thesis);
      const pkgNode = lens.resourceGraph.nodes.find((n) => n.nodeId === pkg.packageRefId);
      if (pkgNode) pkgNode.kind = "package";
      for (const r of pkg.producedResources ?? []) {
        ensureNode(r);
        lens.resourceGraph.edges.push({
          edgeId: `${pkg.packageRefId}->${r}:produces`,
          fromNodeId: pkg.packageRefId,
          toNodeId: r,
          relationship: "produces",
        });
      }
      for (const r of pkg.requiredResources ?? []) {
        ensureNode(r);
        lens.resourceGraph.edges.push({
          edgeId: `${r}->${pkg.packageRefId}:consumes`,
          fromNodeId: r,
          toNodeId: pkg.packageRefId,
          relationship: "consumes",
        });
      }
    }
    for (const e of originalResourceEdges) {
      if (nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId)) lens.resourceGraph.edges.push(e);
    }
  }
  return snapshot;
}

function fixtureToRuntimeSnapshot(fixture: CaseSemanticFixture) {
  const snapshot = {
    caseId: fixture.caseId,
    commanders: fixture.commanders,
    commandZoneConfiguration: fixture.commandZoneConfiguration,
    runtimeSchemaVersion: "phase6a1-semantic-closure-runtime-input-v3",
    roleClassificationArchitecture: "CLOSURE_INFERS_ROLES_OPTION_A",
    frozenFacts: fixture.frozenFacts,
    frozenOpportunities: fixture.frozenOpportunities,
    lenses: fixture.lenses,
  };
  return enrichResourceGraph(snapshot);
}

export function authorSemanticSnapshots(subset: "dev36" | "holdout24-v3"): {
  snapshotDir: string;
  manifestSha256: string;
} {
  const manifest = JSON.parse(
    readFileSync(join(FIXTURE_CATALOG, `${subset}-manifest.json`), "utf8"),
  ) as { cases: Array<{ caseId: string; artifact: string }> };

  const snapshotDir =
    subset === "dev36"
      ? resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-input-v3")
      : resolve(OUT, "phase6a1-professor-plan-holdout24-v3-semantic-closure-input-v3");
  mkdirSync(snapshotDir, { recursive: true });

  const entries: Array<{ caseId: string; artifact: string; sha256: string }> = [];
  for (const entry of manifest.cases) {
    const fixture = JSON.parse(readFileSync(join(FIXTURE_CATALOG, entry.artifact), "utf8")) as CaseSemanticFixture;
    const snapshot = fixtureToRuntimeSnapshot(fixture);
    const artifact = `${entry.caseId}.json`;
    const path = join(snapshotDir, artifact);
    writeFileSync(path, JSON.stringify(snapshot, null, 2));
    entries.push({ caseId: entry.caseId, artifact, sha256: sha256File(path) });
  }

  const manifestSha256 = sha256File(
    (() => {
      const manifestPath = join(snapshotDir, "manifest.json");
      writeFileSync(
        manifestPath,
        JSON.stringify(
          {
            version:
              subset === "dev36"
                ? "phase6a1-professor-plan-dev36-semantic-closure-input-v3"
                : "phase6a1-professor-plan-holdout24-v3-semantic-closure-input-v3",
            generatedAt: new Date().toISOString(),
            runtimeSchemaVersion: "phase6a1-semantic-closure-runtime-input-v3",
            caseCount: entries.length,
            cases: entries,
          },
          null,
          2,
        ),
      );
      return manifestPath;
    })(),
  );

  return { snapshotDir, manifestSha256 };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("run-phase6a1-closure-semantic-snapshot-author-v3.ts")) {
  authorSemanticSnapshots("dev36");
  authorSemanticSnapshots("holdout24-v3");
  console.log("semantic snapshots written");
}
