"use client";

import type {
  SemanticMapCardDetail,
  SemanticMapClusterSummary,
  SemanticMapCompareResult,
  SemanticMapInventoryOverlay,
} from "@/lib/semantic-visualization/types";

export function SemanticMapDetailPanel({
  slug,
  detail,
  inventory,
  clusters,
  onSelectNeighbor,
  onExplainNeighbor,
  compare,
}: {
  slug: string;
  detail: SemanticMapCardDetail | null;
  inventory?: SemanticMapInventoryOverlay;
  clusters: SemanticMapClusterSummary[];
  onSelectNeighbor: (oracleId: string) => void;
  onExplainNeighbor: (neighborOracleId: string) => void;
  compare: SemanticMapCompareResult | null;
}) {
  const cluster = detail ? clusters.find((c) => c.clusterId === detail.clusterId) : null;

  if (!detail) {
    return (
      <aside className="w-96 shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-500">
        <p>Select a card in the map to inspect RC8 semantics, neighbors, and inventory overlay.</p>
        {compare && (
          <div className="mt-4 rounded border border-neutral-800 p-3 text-xs text-neutral-300">
            <p className="font-semibold text-white">Compare</p>
            <p>{compare.cardA.name} ↔ {compare.cardB.name}</p>
            <p className="mt-1">Semantic distance: {compare.semanticDistance.toFixed(4)}</p>
            <p className="mt-1">Shared actions: {compare.sharedActions.join(", ") || "—"}</p>
            <p>Shared zones: {compare.sharedZones.join(", ") || "—"}</p>
            <p>Shared derived roles: {compare.sharedDerivedRoles.join(", ") || "—"}</p>
          </div>
        )}
      </aside>
    );
  }

  const qualityLabel =
    detail.qualityStatus === "publishable"
      ? "Publishable"
      : detail.qualityStatus === "needs_review"
        ? "Needs review"
        : "Quarantined";

  return (
    <aside className="w-96 shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-4 text-sm">
      {detail.imageUrl && (
        <img
          src={detail.imageUrl}
          alt={detail.name}
          className="mx-auto mb-3 w-48 rounded shadow-lg"
        />
      )}

      <h2 className="text-lg font-semibold text-white">{detail.name}</h2>
      <p className="text-neutral-400">{detail.manaCost ?? "—"} · {detail.typeLine}</p>
      <p className="text-xs text-neutral-500">
        Colors: {detail.colorIdentity.join("") || "C"} · MV {detail.manaValue} · Cluster {detail.clusterId}
      </p>
      <p
        className={`mt-1 text-xs ${
          detail.qualityStatus === "publishable"
            ? "text-sky-400"
            : detail.qualityStatus === "needs_review"
              ? "text-amber-400"
              : "text-red-400"
        }`}
      >
        {qualityLabel} · RC8 shadow semantics
      </p>

      {inventory?.inStock && (
        <div className="mt-3 rounded border border-emerald-900/50 bg-emerald-950/30 p-3">
          <p className="text-sm font-medium text-emerald-300">In stock ×{inventory.totalQty}</p>
          <ul className="mt-2 space-y-2">
            {inventory.items.map((item) => (
              <li key={item.inventoryItemId} className="text-xs text-neutral-300">
                <a
                  href={`/s/${slug}/inventory?q=${encodeURIComponent(item.name)}`}
                  className="text-emerald-400 hover:underline"
                >
                  {item.name}
                </a>
                {item.setName ? ` · ${item.setName}` : ""} · ×{item.qty}
                {item.listPrice != null ? ` · $${item.listPrice.toFixed(2)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="mt-4">
        <h3 className="text-xs font-semibold uppercase text-neutral-500">Oracle text</h3>
        {detail.faces.map((face, i) => (
          <div key={i} className="mt-2 rounded bg-neutral-900 p-2 text-xs text-neutral-300 whitespace-pre-wrap">
            {face.name !== detail.name && <p className="font-medium text-white">{face.name}</p>}
            {face.oracleText ?? "—"}
          </div>
        ))}
      </section>

      <section className="mt-4">
        <h3 className="text-xs font-semibold uppercase text-neutral-500">Semantic actions</h3>
        <ul className="mt-2 space-y-1 text-xs">
          {detail.semanticActions.slice(0, 24).map((a, i) => (
            <li key={i} className="rounded bg-neutral-900 px-2 py-1">
              <span className="text-amber-200">{a.actionType}</span>
              {a.sourceZones.length > 0 && (
                <span className="text-neutral-500"> · {a.sourceZones.join(",")} → {a.destinationZones.join(",") || "—"}</span>
              )}
              {a.semanticOwner && <span className="text-neutral-500"> · {a.semanticOwner}</span>}
              <span className={`ml-1 ${a.reviewStatus === "accepted" ? "text-sky-500" : "text-amber-500"}`}>
                [{a.reviewStatus}]
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4">
        <h3 className="text-xs font-semibold uppercase text-neutral-500">Derived roles (visualization)</h3>
        <p className="mt-1 flex flex-wrap gap-1">
          {detail.derivedRoles.map((r) => (
            <span key={r.role} className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
              {r.role.replace(/_/g, " ")}
            </span>
          ))}
        </p>
      </section>

      <section className="mt-4">
        <h3 className="text-xs font-semibold uppercase text-neutral-500">
          Nearest semantic neighbors ({detail.neighbors.length})
        </h3>
        <ul className="mt-2 space-y-2">
          {detail.neighbors.map((n) => (
            <li key={n.oracleId} className="flex items-start gap-2 rounded border border-neutral-800 p-2">
              <button
                type="button"
                onClick={() => onSelectNeighbor(n.oracleId)}
                className="flex-1 text-left text-xs text-sky-300 hover:underline"
              >
                {n.name}
                <span className="block text-neutral-500">distance {n.distance.toFixed(4)}</span>
              </button>
              <button
                type="button"
                onClick={() => onExplainNeighbor(n.oracleId)}
                className="text-[10px] text-neutral-500 hover:text-white"
              >
                Why?
              </button>
            </li>
          ))}
        </ul>
      </section>

      {detail.neighborExplanation && (
        <section className="mt-4 rounded border border-neutral-800 bg-neutral-900 p-3 text-xs">
          <h3 className="font-semibold text-white">Why are these near each other?</h3>
          <p className="mt-2 text-neutral-400">
            Shared actions: {detail.neighborExplanation.sharedActions.join(", ") || "—"}
          </p>
          <p className="text-neutral-400">
            Shared zones: {detail.neighborExplanation.sharedZones.join(", ") || "—"}
          </p>
          <p className="text-neutral-400">
            Shared zone flows: {detail.neighborExplanation.sharedZoneFlows.join(", ") || "—"}
          </p>
          <p className="text-neutral-400">
            Shared ability types: {detail.neighborExplanation.sharedAbilityTypes.join(", ") || "—"}
          </p>
          <p className="text-neutral-400">
            Shared semantic owners: {detail.neighborExplanation.sharedSemanticOwners.join(", ") || "—"}
          </p>
          <p className="text-neutral-400">
            Shared derived roles: {detail.neighborExplanation.sharedDerivedRoles.join(", ") || "—"}
          </p>
        </section>
      )}

      {cluster && (
        <section className="mt-4 rounded border border-neutral-800 p-3 text-xs">
          <h3 className="font-semibold text-white">Cluster {cluster.clusterId} ({cluster.size} cards)</h3>
          <p className="mt-1 text-neutral-400">
            Top actions: {cluster.topActions.map((a) => a.action).join(", ") || "—"}
          </p>
          <p className="text-neutral-400">
            Top derived: {cluster.topDerivedRoles.map((r) => r.role).join(", ") || "—"}
          </p>
          <p className="mt-1 text-neutral-500">
            Representatives: {cluster.representativeCards.map((c) => c.name).join(", ")}
          </p>
        </section>
      )}

      <p className="mt-6 text-[10px] text-neutral-600">
        Coordinates: UMAP-1 {detail.coordinates.x.toFixed(3)}, UMAP-2 {detail.coordinates.y.toFixed(3)}, UMAP-3{" "}
        {detail.coordinates.z.toFixed(3)}
      </p>
    </aside>
  );
}
