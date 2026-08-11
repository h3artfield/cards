"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  SemanticMapCardDetail,
  SemanticMapClusterSummary,
  SemanticMapCompareResult,
  SemanticMapFilters,
  SemanticMapInventoryOverlay,
  SemanticMapManifest,
  SemanticMapPoint,
} from "@/lib/semantic-visualization/types";
import { DEFAULT_SEMANTIC_MAP_FILTERS, filterSemanticMapPoints, rankBySemanticNeighborLimit } from "@/lib/semantic-visualization/filters-v1";
import { SemanticMapCanvas3D } from "./SemanticMapCanvas3D";
import { SemanticMapCanvas2D } from "./SemanticMapCanvas2D";
import { SemanticMapFiltersPanel } from "./SemanticMapFiltersPanel";
import { SemanticMapDetailPanel } from "./SemanticMapDetailPanel";

export type VisualizationMode = "3d" | "2d" | "neighborhood";

type Payload = {
  manifest: SemanticMapManifest;
  points: SemanticMapPoint[];
  inventoryOverlay: Record<string, SemanticMapInventoryOverlay>;
};

export function SemanticMapApp({ slug }: { slug: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [clusters, setClusters] = useState<SemanticMapClusterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SemanticMapFilters>(DEFAULT_SEMANTIC_MAP_FILTERS);
  const [mode, setMode] = useState<VisualizationMode>("3d");
  const [selectedOracleId, setSelectedOracleId] = useState<string | null>(null);
  const [hoverOracleId, setHoverOracleId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SemanticMapCardDetail | null>(null);
  const [compare, setCompare] = useState<SemanticMapCompareResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SemanticMapPoint[]>([]);
  const [flyTarget, setFlyTarget] = useState<string | null>(null);
  const [showEdges, setShowEdges] = useState({
    semanticNeighbors: false,
    sharedActions: false,
    zoneFlow: false,
    grantedAbility: false,
  });
  const [neighborMap, setNeighborMap] = useState<Map<string, Array<{ oracleId: string; distance: number }>>>(
    new Map(),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [dataRes, clusterRes] = await Promise.all([
          fetch(`/api/store/${slug}/semantic-map/data`),
          fetch(`/api/store/${slug}/semantic-map/clusters`),
        ]);
        if (!dataRes.ok) {
          const body = (await dataRes.json()) as { error?: string };
          throw new Error(body.error ?? "Failed to load semantic map");
        }
        const data = (await dataRes.json()) as Payload;
        if (cancelled) return;
        setPayload(data);
        if (clusterRes.ok) {
          const clusterBody = (await clusterRes.json()) as { clusters: SemanticMapClusterSummary[] };
          setClusters(clusterBody.clusters ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const inventoryMap = useMemo(() => {
    if (!payload) return new Map<string, SemanticMapInventoryOverlay>();
    return new Map(Object.entries(payload.inventoryOverlay));
  }, [payload]);

  const commanderColors = useMemo(() => {
    if (!filters.commanderOracleId || !payload) return undefined;
    const cmd = payload.points.find((p) => p.oracleId === filters.commanderOracleId);
    return cmd?.colorIdentity;
  }, [filters.commanderOracleId, payload]);

  const centerCommanderColors = useMemo(() => {
    if (!filters.centerCommanderOracleId || !payload) return undefined;
    const cmd = payload.points.find((p) => p.oracleId === filters.centerCommanderOracleId);
    return cmd?.colorIdentity;
  }, [filters.centerCommanderOracleId, payload]);

  const filteredPoints = useMemo(() => {
    if (!payload) return [];
    let points = filterSemanticMapPoints(
      payload.points,
      filters,
      inventoryMap,
      commanderColors ?? centerCommanderColors,
    );

    if (filters.centerCommanderOracleId && filters.neighborLimit && neighborMap.size > 0) {
      points = rankBySemanticNeighborLimit(
        points,
        filters.centerCommanderOracleId,
        neighborMap,
        filters.neighborLimit,
      );
    }

    if (mode === "neighborhood" && selectedOracleId && neighborMap.size > 0) {
      points = rankBySemanticNeighborLimit(points, selectedOracleId, neighborMap, 100);
    }

    return points;
  }, [payload, filters, inventoryMap, commanderColors, centerCommanderColors, neighborMap, mode, selectedOracleId]);

  const loadDetail = useCallback(
    async (oracleId: string) => {
      const res = await fetch(`/api/store/${slug}/semantic-map/card/${oracleId}`);
      if (!res.ok) return;
      const body = (await res.json()) as SemanticMapCardDetail;
      setDetail(body);
      setNeighborMap((prev) => {
        const next = new Map(prev);
        next.set(oracleId, body.neighbors.map((n) => ({ oracleId: n.oracleId, distance: n.distance })));
        return next;
      });
    },
    [slug],
  );

  const selectCard = useCallback(
    async (oracleId: string, fly = true) => {
      setSelectedOracleId(oracleId);
      if (fly) setFlyTarget(oracleId);
      await loadDetail(oracleId);
    },
    [loadDetail],
  );

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/store/${slug}/semantic-map/search?q=${encodeURIComponent(searchQuery)}&limit=12`,
      );
      if (!res.ok) return;
      const body = (await res.json()) as { results: SemanticMapPoint[] };
      setSearchResults(body.results ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [searchQuery, slug]);

  const runCompare = useCallback(async () => {
    if (!filters.compareA || !filters.compareB) return;
    const res = await fetch(
      `/api/store/${slug}/semantic-map/compare?a=${encodeURIComponent(filters.compareA)}&b=${encodeURIComponent(filters.compareB)}`,
    );
    if (!res.ok) return;
    setCompare((await res.json()) as SemanticMapCompareResult);
  }, [filters.compareA, filters.compareB, slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        Loading RC8 semantic map…
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-center text-red-300">
        {error ?? "Semantic map unavailable"}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-200">
      <header className="border-b border-neutral-800 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-amber-200">{payload.manifest.label}</p>
            <p className="max-w-3xl text-xs text-neutral-500">{payload.manifest.disclaimer}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["3d", "2d", "neighborhood"] as VisualizationMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded px-3 py-1 text-sm ${mode === m ? "bg-amber-700 text-white" : "bg-neutral-800 text-neutral-300"}`}
              >
                {m === "3d" ? "3D Map" : m === "2d" ? "2D Map" : "Neighborhood"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || searchResults.length === 0) return;
              e.preventDefault();
              const pick = searchResults[0];
              void selectCard(pick.oracleId);
              setSearchQuery(pick.name);
              setSearchResults([]);
            }}
            placeholder="Search card name (e.g. Sol Ring)"
            className="min-w-[240px] flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
          />
          {searchResults.length > 0 && (
            <div className="absolute z-20 mt-24 max-h-64 w-80 overflow-auto rounded border border-neutral-700 bg-neutral-900 shadow-xl">
              {searchResults.map((r) => (
                <button
                  key={r.oracleId}
                  type="button"
                  onClick={() => {
                    void selectCard(r.oracleId);
                    setSearchQuery(r.name);
                    setSearchResults([]);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-800"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
          <span className="text-xs text-neutral-500">
            {filteredPoints.length.toLocaleString()} / {payload.points.length.toLocaleString()} cards visible
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <SemanticMapFiltersPanel
          slug={slug}
          filters={filters}
          onChange={setFilters}
          points={payload.points}
          onCompare={runCompare}
          showEdges={showEdges}
          onShowEdgesChange={setShowEdges}
        />

        <main className="relative min-w-0 flex-1">
          {mode === "2d" ? (
            <SemanticMapCanvas2D
              points={filteredPoints}
              allPoints={payload.points}
              selectedOracleId={selectedOracleId}
              hoverOracleId={hoverOracleId}
              highlightOracleIds={[
                filters.commanderOracleId,
                filters.centerCommanderOracleId,
              ].filter(Boolean) as string[]}
              compare={compare}
              inventoryMap={inventoryMap}
              flyTarget={flyTarget}
              onFlyComplete={() => setFlyTarget(null)}
              onHover={setHoverOracleId}
              onSelect={(id) => void selectCard(id)}
            />
          ) : (
            <SemanticMapCanvas3D
              points={filteredPoints}
              allPoints={payload.points}
              selectedOracleId={selectedOracleId}
              hoverOracleId={hoverOracleId}
              highlightOracleIds={[
                filters.commanderOracleId,
                filters.centerCommanderOracleId,
              ].filter(Boolean) as string[]}
              compare={compare}
              showEdges={showEdges}
              neighborMap={neighborMap}
              inventoryMap={inventoryMap}
              flyTarget={flyTarget}
              onFlyComplete={() => setFlyTarget(null)}
              onHover={setHoverOracleId}
              onSelect={(id) => void selectCard(id)}
            />
          )}

          {hoverOracleId && (
            <div className="pointer-events-none absolute left-4 top-4 max-w-xs rounded border border-neutral-700 bg-neutral-900/95 p-3 text-xs shadow-lg">
              {(() => {
                const p = payload.points.find((x) => x.oracleId === hoverOracleId);
                if (!p) return null;
                const inv = inventoryMap.get(p.oracleId);
                return (
                  <>
                    <p className="font-semibold text-white">{p.name}</p>
                    <p className="text-neutral-400">{p.manaCost ?? "—"} · {p.typeLine}</p>
                    <p className="text-neutral-400">Colors: {p.colorIdentity.join("") || "C"}</p>
                    <p className="text-neutral-400">Top actions: {p.topActions.slice(0, 5).join(", ") || "—"}</p>
                    {inv?.inStock && (
                      <p className="mt-1 text-emerald-400">In stock ×{inv.totalQty}</p>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </main>

        <SemanticMapDetailPanel
          slug={slug}
          detail={detail}
          inventory={detail ? inventoryMap.get(detail.oracleId) : undefined}
          clusters={clusters}
          onSelectNeighbor={(id) => void selectCard(id)}
          onExplainNeighbor={async (neighborId) => {
            if (!detail) return;
            const res = await fetch(
              `/api/store/${slug}/semantic-map/card/${detail.oracleId}?neighborOracleId=${neighborId}`,
            );
            if (!res.ok) return;
            setDetail((await res.json()) as SemanticMapCardDetail);
          }}
          compare={compare}
        />
      </div>
    </div>
  );
}
