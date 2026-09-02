"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Tab =
  | "OVERVIEW"
  | "CARDS"
  | "FEATURES"
  | "RECIPES"
  | "VARIANTS"
  | "ML BENCHMARKS"
  | "RECONSTRUCTION"
  | "CANDIDATES";

const TABS: Tab[] = [
  "OVERVIEW",
  "CARDS",
  "FEATURES",
  "RECIPES",
  "VARIANTS",
  "ML BENCHMARKS",
  "RECONSTRUCTION",
  "CANDIDATES",
];

function pct(n: unknown): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `${(n * (n > 1 ? 1 : 100)).toFixed(n > 1 ? 1 : 1)}${n > 1 ? "%" : "%"}`;
}

function num(n: unknown, digits = 3): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

export function MechanicalSpaceApp() {
  const [tab, setTab] = useState<Tab>("OVERVIEW");
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/experimental/mechanical-space/overview")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? r.statusText);
        setOverview(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4">
        <div className="text-xs uppercase tracking-widest text-amber-400">Experimental · local only</div>
        <h1 className="text-2xl font-semibold">Mechanical Space</h1>
        <p className="max-w-3xl text-sm text-neutral-400">
          Existing RC8 Oracle semantic vectors + Commander Spellbook as a mechanical scaffold. Predictions are never
          canonical truth. Production Firestore is read-only.
        </p>
      </header>
      <nav className="flex flex-wrap gap-2 border-b border-neutral-800 px-6 py-3">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1 text-sm ${tab === t ? "bg-amber-500 text-black" : "bg-neutral-800 text-neutral-200"}`}
          >
            {t}
          </button>
        ))}
      </nav>
      <main className="px-6 py-5">
        {error && <p className="text-red-400">{error}</p>}
        {tab === "OVERVIEW" && <OverviewPanel data={overview} />}
        {tab === "CARDS" && <CardPanel />}
        {tab === "FEATURES" && <FeaturePanel />}
        {tab === "RECIPES" && <RecipesPanel />}
        {tab === "VARIANTS" && <VariantsPanel />}
        {tab === "ML BENCHMARKS" && <BenchmarksPanel />}
        {tab === "RECONSTRUCTION" && <ReconstructionPanel />}
        {tab === "CANDIDATES" && <CandidatesPanel />}
      </main>
    </div>
  );
}

function OverviewPanel({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return <p className="text-neutral-400">Loading overview…</p>;
  const snap = data.snapshot as Record<string, unknown> | null;
  const val = data.snapshotValidation as Record<string, unknown> | null;
  const sb = data.spellbook as Record<string, unknown> | null;
  const id = data.identity as Record<string, unknown> | null;
  const parity = data.parity as Record<string, unknown> | null;
  const ml = data.ml as { comparison?: Record<string, number>; linearProbe?: { micro?: { f1VsUnlabeled?: number } }; mlp?: { micro?: { f1VsUnlabeled?: number } } } | null;
  const recon = data.reconstruction as Record<string, unknown> | null;
  const cand = data.candidates as Record<string, unknown> | null;
  const counts = (sb?.counts ?? {}) as Record<string, number>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <StatCard title="Oracle snapshot" items={[
        ["Cards / vectors", `${val?.oracleRecords ?? "—"} / ${val?.vectorCount ?? "—"}`],
        ["Dimensions", String(snap?.dimensions ?? "—")],
        ["Model", String(snap?.model ?? "RC8 feature vectors")],
        ["Checksum", String(snap?.checksum ?? "—").slice(0, 16)],
        ["Missing embeddings", String(val?.missingEmbeddings ?? "—")],
      ]} />
      <StatCard title="Reference graph" items={[
        ["Features", String(counts.features ?? "—")],
        ["Mapped cards", String(counts.cards ?? "—")],
        ["Recipes (variants sample)", String(counts.variants ?? "—")],
        ["Templates", String(counts.templates ?? "—")],
        ["Identity resolution", id ? `${Number(id.resolutionPct ?? 0).toFixed(1)}%` : "—"],
      ]} />
      <StatCard title="Deterministic parity" items={[
        ["Synthetic engine", String(parity?.syntheticEngineSelftest ?? "—")],
        ["Exact parity", parity ? `${Number(parity.exactParityPct ?? 0).toFixed(1)}%` : "—"],
        ["Missing / extra", `${parity?.missing ?? "—"} / ${parity?.additional ?? "—"}`],
      ]} />
      <StatCard title="ML + reconstruction" items={[
        ["Linear PU F1", num(ml?.linearProbe?.micro?.f1VsUnlabeled)],
        ["MLP PU F1", num(ml?.mlp?.micro?.f1VsUnlabeled)],
        ["Holdout reconstruction recall", num(recon?.recall as number | undefined)],
        ["Candidate interactions", String(cand?.candidatesGenerated ?? "—")],
      ]} />
      <StatCard title="K v1 / deck profiles" items={[
        ["K status", String((data.pressureKLock as { status?: string } | null)?.status ?? (data.pressureK as { status?: string } | null)?.status ?? "—")],
        ["Reviewed K edges", String(((data.pressureK as { matrix?: { reviewed?: number } } | null)?.matrix?.reviewed) ?? "—")],
        ["Decks profiled", String((data.deckProfiles as { decksProfiled?: number } | null)?.decksProfiled ?? "—")],
        ["Averages used", String((data.deckProfiles as { didNotAverageCoordinates?: boolean } | null)?.didNotAverageCoordinates === true ? "no" : "—")],
        ["A→B pressure", String((data.deckPressure as { directedPairs?: number } | null)?.directedPairs ? `${(data.deckPressure as { directedPairs: number }).directedPairs} pairs` : "—")],
        ["K coverage (mean)", String(((data.deckPressure as { coverageSummary?: { conservative?: { mean?: number } } } | null)?.coverageSummary?.conservative?.mean) ?? "—")],
      ]} />
      <div className="md:col-span-2 rounded border border-neutral-800 p-4 text-sm text-neutral-400">
        Route: http://localhost:3000/experimental/mechanical-space · Safety: production writes NONE · OpenAI NONE ·
        embeddings unmodified · K frozen · no deck-vs-deck pressure
      </div>
    </div>
  );
}

function StatCard({ title, items }: { title: string; items: Array<[string, string]> }) {
  return (
    <section className="rounded border border-neutral-800 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-300">{title}</h2>
      <dl className="space-y-2 text-sm">
        {items.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-neutral-400">{k}</dt>
            <dd className="text-right font-mono text-neutral-100">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CardPanel() {
  const [q, setQ] = useState("Pitiless Plunderer");
  const [hits, setHits] = useState<Array<{ oracleId: string; name: string }>>([]);
  const [card, setCard] = useState<Record<string, unknown> | null>(null);

  const search = useCallback(async () => {
    const res = await fetch(`/api/experimental/mechanical-space/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setHits(data.hits ?? []);
  }, [q]);

  const load = useCallback(async (oracleId: string) => {
    const res = await fetch(`/api/experimental/mechanical-space/card?oracleId=${encodeURIComponent(oracleId)}`);
    setCard(await res.json());
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className="w-full max-w-md rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search Oracle card"
        />
        <button type="button" className="rounded bg-amber-500 px-3 text-black" onClick={search}>
          Search
        </button>
      </div>
      <ul className="flex flex-wrap gap-2 text-sm">
        {hits.map((h) => (
          <li key={h.oracleId}>
            <button type="button" className="rounded bg-neutral-800 px-2 py-1" onClick={() => load(h.oracleId)}>
              {h.name}
            </button>
          </li>
        ))}
      </ul>
      {card && !("error" in card) && (
        <article className="space-y-3 rounded border border-neutral-800 p-4">
          <h2 className="text-xl">{String((card.card as { name?: string })?.name)}</h2>
          <p className="text-sm text-neutral-400">{String((card.card as { typeLine?: string })?.typeLine ?? "")}</p>
          <pre className="whitespace-pre-wrap text-sm text-neutral-300">
            {String((card.card as { oracleText?: string })?.oracleText ?? "(oracle text from shadow abilities only)")}
          </pre>
          <p className="text-xs text-neutral-500">
            Embedding: {JSON.stringify(card.embedding)} — existing RC8 vector, not a new model.
          </p>
          <section>
            <h3 className="text-amber-300">KNOWN (grounded)</h3>
            <ul>
              {((card.knownFeatures as Array<{ name: string }>) ?? []).map((f) => (
                <li key={f.name} className="text-emerald-300">{f.name} · grounded</li>
              ))}
              {!(card.knownFeatures as unknown[])?.length && <li className="text-neutral-500">No grounded Spellbook features in the local sample.</li>}
            </ul>
          </section>
          <section>
            <h3 className="text-amber-300">PREDICTED (not truth)</h3>
            <ul>
              {((card.predictedFeatures as Array<{ name: string; linear?: number; mlp?: number }>) ?? []).map((f) => (
                <li key={f.name} className="text-sky-300">
                  {f.name} · linear {num(f.linear)} · mlp {num(f.mlp)}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-amber-300">Semantic neighbors</h3>
            <ul>
              {((card.semanticNeighbors as Array<{ oracleId: string; distance: number }>) ?? []).map((n) => (
                <li key={n.oracleId} className="font-mono text-sm">
                  {n.oracleId} · d={num(n.distance)}
                </li>
              ))}
            </ul>
          </section>
        </article>
      )}
    </div>
  );
}

function FeaturePanel() {
  const [q, setQ] = useState("Infinite");
  const [hits, setHits] = useState<Array<{ featureId: string; name: string; positiveExamples: number }>>([]);
  const [feat, setFeat] = useState<Record<string, unknown> | null>(null);

  const search = useCallback(async () => {
    const res = await fetch(`/api/experimental/mechanical-space/search?kind=features&q=${encodeURIComponent(q)}`);
    setHits((await res.json()).hits ?? []);
  }, [q]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className="w-full max-w-md rounded border border-neutral-700 bg-neutral-900 px-3 py-2" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="rounded bg-amber-500 px-3 text-black" onClick={search}>Search features</button>
      </div>
      <ul className="space-y-1 text-sm">
        {hits.map((h) => (
          <li key={h.featureId}>
            <button type="button" className="text-left text-sky-300" onClick={async () => {
              const res = await fetch(`/api/experimental/mechanical-space/feature?featureId=${encodeURIComponent(h.featureId)}`);
              setFeat(await res.json());
            }}>
              {h.name} ({h.positiveExamples})
            </button>
          </li>
        ))}
      </ul>
      {feat && !("error" in feat) && (
        <article className="rounded border border-neutral-800 p-4 text-sm">
          <h2 className="text-lg">{String((feat.feature as { name?: string })?.name)}</h2>
          <p>Support {String((feat.feature as { positiveExamples?: number })?.positiveExamples)} · known negatives {String(feat.knownNegatives)} · unknown {String(feat.unknown)}</p>
          <p className="text-neutral-400">Linear {JSON.stringify(feat.linear)} · MLP {JSON.stringify(feat.mlp)}</p>
          <h3 className="mt-3 text-amber-300">Known providers</h3>
          <ul>{((feat.knownProviders as Array<{ name: string }>) ?? []).slice(0, 20).map((p) => <li key={p.name}>{p.name}</li>)}</ul>
          <h3 className="mt-3 text-amber-300">Highest-confidence predicted unseen</h3>
          <ul>
            {((feat.highestConfidencePredictedUnseen as Array<{ name: string; confidence: number }>) ?? []).map((p) => (
              <li key={p.name} className="text-sky-300">{p.name} · {num(p.confidence)}</li>
            ))}
          </ul>
        </article>
      )}
    </div>
  );
}

function RecipesPanel() {
  return (
    <Parityish view="parity" title="Recipes / reconstructed families" />
  );
}

function VariantsPanel() {
  return (
    <div className="space-y-3 text-sm text-neutral-300">
      <p>
        Public Spellbook variants are the concrete generated combinations. Our engine reconstructs families from
        <code> uses + templates + produces</code>. Proof chains are shown on generated candidates.
      </p>
      <Parityish view="parity" title="Variant family mismatches (individual, not hidden)" />
    </div>
  );
}

function BenchmarksPanel() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    fetch("/api/experimental/mechanical-space/reports?view=benchmarks")
      .then((r) => r.json())
      .then(setData);
  }, []);
  const rows = useMemo(() => {
    if (!data) return [];
    const freq = (data.baselines as { frequency?: { micro?: { f1VsUnlabeled?: number }; macroF1?: number; mAP?: number; "precision@5"?: number; "recall@5"?: number } })?.frequency;
    const knn = (data.baselines as { knn?: Record<string, { micro?: { f1VsUnlabeled?: number }; macroF1?: number; mAP?: number; "precision@5"?: number; "recall@5"?: number }> })?.knn?.["5"];
    const lin = data.linearProbe as { micro?: { f1VsUnlabeled?: number }; macroF1?: number; mAP?: number; "precision@5"?: number; "recall@5"?: number } | undefined;
    const mlp = data.mlp as typeof lin;
    return [
      ["Frequency", freq],
      ["k-NN k=5", knn],
      ["Linear probe", lin],
      ["MLP", mlp],
    ] as const;
  }, [data]);
  if (!data) return <p>Loading benchmarks…</p>;
  return (
    <div className="space-y-4">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-amber-300">
            <th>Model</th><th>Micro F1</th><th>Macro F1</th><th>mAP</th><th>P@5</th><th>R@5</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, m]) => (
            <tr key={name} className="border-t border-neutral-800">
              <td>{name}</td>
              <td>{num(m?.micro?.f1VsUnlabeled)}</td>
              <td>{num(m?.macroF1)}</td>
              <td>{num(m?.mAP)}</td>
              <td>{num(m?.["precision@5"])}</td>
              <td>{num(m?.["recall@5"])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-neutral-500">Per-feature metrics are in the ML report JSON. UNKNOWN labels were masked, never treated as negatives.</p>
    </div>
  );
}

function ReconstructionPanel() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    fetch("/api/experimental/mechanical-space/reports?view=reconstruction").then((r) => r.json()).then(setData);
  }, []);
  if (!data) return <p>Loading reconstruction…</p>;
  return (
    <pre className="overflow-auto rounded border border-neutral-800 p-4 text-xs">{JSON.stringify(data, null, 2)}</pre>
  );
}

function CandidatesPanel() {
  const [data, setData] = useState<{ report?: Record<string, unknown>; queue?: { items?: Array<Record<string, unknown>> } } | null>(null);
  const [reason, setReason] = useState("Needs human rules check");
  useEffect(() => {
    fetch("/api/experimental/mechanical-space/reports?view=candidates").then((r) => r.json()).then(setData);
  }, []);
  if (!data) return <p>Loading candidates…</p>;
  const items = data.queue?.items ?? [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-amber-200">These are candidates, not verified combos. Reviews stay local.</p>
      {items.slice(0, 20).map((c) => (
        <article key={String(c.id)} className="rounded border border-neutral-800 p-3 text-sm">
          <div className="font-mono text-xs text-neutral-500">{String(c.classification)}</div>
          <div>{((c.cards as Array<{ name?: string }>) ?? []).map((x) => x.name).join(" + ")}</div>
          <div className="text-neutral-400">confidence {num(c.confidence as number)}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1" value={reason} onChange={(e) => setReason(e.target.value)} />
            {(["CONFIRMED", "REJECTED", "UNCERTAIN"] as const).map((d) => (
              <button
                key={d}
                type="button"
                className="rounded bg-neutral-800 px-2 py-1"
                onClick={() => {
                  fetch("/api/experimental/mechanical-space/review", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ candidateId: c.id, decision: d, reason }),
                  });
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function Parityish({ view, title }: { view: string; title: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    fetch(`/api/experimental/mechanical-space/reports?view=${view}`).then((r) => r.json()).then(setData);
  }, [view]);
  if (!data) return <p>Loading…</p>;
  return (
    <section>
      <h2 className="mb-2 text-amber-300">{title}</h2>
      <pre className="overflow-auto rounded border border-neutral-800 p-4 text-xs">{JSON.stringify(data, null, 2)}</pre>
    </section>
  );
}

void pct;
