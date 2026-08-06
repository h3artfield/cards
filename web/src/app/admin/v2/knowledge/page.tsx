"use client";

import { useMemo, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminPricingHeader, AdminPricingSubNav } from "@/components/admin/AdminPricingSubNav";
import {
  getAllKnowledgeCategories,
  searchKnowledgeCategories,
  type KnowledgeCategoryView,
  type KnowledgeGuideCompleteness,
} from "@/lib/card-flow-v2/knowledge-viewer-data";
import type { CardCategory } from "@/lib/card-flow-v2/types";

function CompletenessBadge({ level }: { level: KnowledgeGuideCompleteness }) {
  const styles: Record<KnowledgeGuideCompleteness, string> = {
    complete: "bg-emerald-100 text-emerald-900",
    partial: "bg-amber-100 text-amber-900",
    generic: "bg-gray-100 text-gray-700",
  };
  const labels: Record<KnowledgeGuideCompleteness, string> = {
    complete: "Complete guide",
    partial: "Partial guide",
    generic: "Generic / incomplete",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[level]}`}>
      {labels[level]}
    </span>
  );
}

function BulletList({ items, title }: { items: string[]; title: string }) {
  if (!items.length) return null;
  return (
    <section className="mt-4">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
        {items.map((item) => (
          <li key={item.slice(0, 40)}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function CategoryPanel({ view }: { view: KnowledgeCategoryView }) {
  const [jsonOpen, setJsonOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(true);

  async function copyJson() {
    await navigator.clipboard.writeText(JSON.stringify(view.rawJson, null, 2));
  }

  const { guide } = view;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{view.displayName}</h2>
          <p className="text-xs text-gray-500">Category key: {view.category}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CompletenessBadge level={view.completeness} />
          {view.highRiskVariants && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900">
              High-risk variants
            </span>
          )}
          {view.knowledgeVersion && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900">
              {view.knowledgeVersion}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-950">
        <p className="font-medium">Staff summary</p>
        <p className="mt-1 whitespace-pre-wrap">{view.staffSummary}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSectionsOpen((v) => !v)}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          {sectionsOpen ? "Collapse sections" : "Expand sections"}
        </button>
        <button
          type="button"
          onClick={() => void copyJson()}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          Copy guide JSON
        </button>
        <button
          type="button"
          onClick={() => setJsonOpen((v) => !v)}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          {jsonOpen ? "Hide raw JSON" : "Show raw JSON"}
        </button>
      </div>

      {sectionsOpen && (
        <>
          {guide.identificationFormula && (
            <p className="mt-4 text-sm text-gray-700">
              <span className="font-semibold">Identification formula: </span>
              {guide.identificationFormula}
            </p>
          )}
          {guide.catalogSources && guide.catalogSources.length > 0 && (
            <BulletList items={guide.catalogSources} title="Catalog sources" />
          )}
          <BulletList items={guide.importantRegions} title="Important card regions" />
          <BulletList items={guide.keyFields} title="Key identity fields" />
          <BulletList items={guide.variantTraps} title="Variant traps" />
          <BulletList items={guide.lockRequirements} title="Lock requirements" />
          <BulletList items={guide.staffTips} title="Staff tips" />
          {guide.marketResearchNotes && (
            <BulletList items={guide.marketResearchNotes} title="Market research notes" />
          )}
          <BulletList items={view.marketSearchRules} title="Market search rules" />
          <BulletList items={view.compRejectionRules} title="Comp rejection rules" />
          <BulletList items={view.offerPreviewNotes} title="Offer preview policy" />
          {view.extraNotes.length > 0 && (
            <BulletList items={view.extraNotes} title="Additional notes" />
          )}
        </>
      )}

      {jsonOpen && (
        <pre className="mt-4 max-h-96 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
          {JSON.stringify(view.rawJson, null, 2)}
        </pre>
      )}
    </div>
  );
}

const TAB_ORDER: CardCategory[] = [
  "pokemon",
  "mtg",
  "yugioh",
  "sports",
  "riftbound",
  "onepiece",
  "lorcana",
  "unknown",
];

export default function KnowledgeBasePage() {
  const all = useMemo(() => getAllKnowledgeCategories(), []);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<CardCategory>("pokemon");

  const filtered = useMemo(
    () => searchKnowledgeCategories(search, all),
    [search, all],
  );

  const active =
    filtered.find((c) => c.category === activeTab) ??
    filtered[0] ??
    all[0]!;

  return (
    <AdminLayout>
      <AdminPricingHeader />

      <div className="mt-4">
        <AdminPricingSubNav />
      </div>

      <h1 className="mt-6 text-xl font-semibold text-gray-900">V2 Card Knowledge Base</h1>
      <p className="mt-2 max-w-3xl text-sm text-gray-600">
        Reference guides used by Card Flow V2 for evidence extraction, suspect generation,
        identity locking, market search, and offer preview policy. Shadow mode only — these
        guides do not change production offers.
      </p>

      <div className="mt-4">
        <input
          type="search"
          placeholder="Search guides (e.g. reverse holo, signature, parallel)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-1 border-b border-gray-200 pb-2">
        {TAB_ORDER.filter((cat) => filtered.some((c) => c.category === cat)).map((cat) => {
          const view = all.find((c) => c.category === cat)!;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveTab(cat)}
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                activeTab === cat
                  ? "bg-violet-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {view.displayName}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">No guides match your search.</p>
      ) : (
        <div className="mt-4">
          <CategoryPanel view={active} />
        </div>
      )}

      {!search && (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {all.map((c) => (
            <button
              key={c.category}
              type="button"
              onClick={() => {
                setSearch("");
                setActiveTab(c.category);
              }}
              className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-left text-sm hover:border-violet-300"
            >
              <p className="font-medium">{c.displayName}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <CompletenessBadge level={c.completeness} />
              </div>
              <p className="mt-2 line-clamp-3 text-xs text-gray-600">{c.staffSummary}</p>
            </button>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
