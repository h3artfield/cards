"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { AdminPricingHeader, AdminPricingSubNav } from "@/components/admin/AdminPricingSubNav";
import { Button } from "@/components/Button";
import { CONDITION_LABELS } from "@/lib/constants";
import { adminFetch } from "@/lib/api-client";
import { useAdmin } from "@/context/AdminContext";
import { DEFAULT_STORE_RULES } from "@/lib/default-store-rules";
import type { CardCategory, ConditionEstimate, RuleType, StoreRule, StoreSettings } from "@/lib/types";
import { RULE_TYPE_LABELS } from "@/lib/types";

const RULE_TYPES = Object.keys(RULE_TYPE_LABELS) as RuleType[];

const SECTIONS = [
  { id: "rules", label: "Rules" },
  { id: "buy", label: "Buy %" },
  { id: "conditions", label: "Conditions" },
  { id: "providers", label: "Providers" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

type BuyPercentFields = Pick<
  StoreSettings,
  | "defaultCashPercent"
  | "defaultTradePercent"
  | "slabCashPercent"
  | "slabTradePercent"
  | "manualReviewThreshold"
  | "minimumOffer"
>;

const BUY_PERCENT_FIELDS: Array<{
  name: keyof BuyPercentFields;
  label: string;
  step: string;
}> = [
  { name: "defaultCashPercent", label: "Default cash %", step: "0.01" },
  { name: "defaultTradePercent", label: "Default trade %", step: "0.01" },
  { name: "slabCashPercent", label: "Slab cash %", step: "0.01" },
  { name: "slabTradePercent", label: "Slab trade %", step: "0.01" },
  {
    name: "manualReviewThreshold",
    label: "Manual review threshold ($)",
    step: "1",
  },
  { name: "minimumOffer", label: "Minimum offer ($)", step: "1" },
];

const CONDITIONS: ConditionEstimate[] = ["NM", "LP", "MP", "HP", "DMG"];

const PROVIDERS = [
  {
    name: "TCGplayer",
    category: "Magic · Pokémon · Yu-Gi-Oh",
    status: "Primary",
    note: "Lowest listing price is preferred for market value when a product is mapped.",
  },
  {
    name: "Scryfall",
    category: "Magic: The Gathering",
    status: "Active",
    note: "Free API, no key required",
  },
  {
    name: "YGOProDeck",
    category: "Yu-Gi-Oh!",
    status: "Active",
    note: "Free API, no key required",
  },
  {
    name: "Pokémon TCG API",
    category: "Pokémon",
    status: "Optional",
    note: "Set POKEMON_TCG_API_KEY for live pricing",
  },
  {
    name: "PriceCharting",
    category: "Pokémon / Yu-Gi-Oh / Sports",
    status: "Fallback",
    note: "Set PRICECHARTING_API_KEY — merged with catalog + eBay comps for market price",
  },
  {
    name: "eBay",
    category: "All categories · especially sports",
    status: "Recommended",
    note: "Set EBAY_CLIENT_ID + EBAY_CLIENT_SECRET — sold/active listings merged with catalog + PriceCharting.",
  },
  {
    name: "OpenAI Vision",
    category: "Sports / other (no catalog hit)",
    status: "Fallback",
    note: "Same vision pass as identity — estimates market $ when PriceCharting/eBay return $0. Always flagged for staff review; API comps trump AI.",
  },
];

export function AdminPricingContent({
  initialSection = "rules",
}: {
  initialSection?: SectionId;
}) {
  const { loading: authLoading, activeStore } = useAdmin();
  const [section, setSection] = useState<SectionId>(initialSection);
  const [rules, setRules] = useState<StoreRule[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyDraft, setBuyDraft] = useState<BuyPercentFields | null>(null);
  const [conditionDraft, setConditionDraft] = useState<
    StoreSettings["conditionMultipliers"] | null
  >(null);
  const [savingBuy, setSavingBuy] = useState(false);
  const [savingConditions, setSavingConditions] = useState(false);
  const [newRuleType, setNewRuleType] = useState<RuleType>("do_not_buy");

  async function loadRules() {
    const res = await adminFetch("/api/admin/rules");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not load rules");
    setRules(data.rules ?? []);
  }

  async function loadSettings() {
    const res = await adminFetch("/api/admin/settings");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not load settings");
    setSettings(data.settings);
  }

  useEffect(() => {
    if (authLoading || !activeStore) return;
    setLoading(true);
    setError(null);
    Promise.all([loadRules(), loadSettings()])
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Load failed"),
      )
      .finally(() => setLoading(false));
  }, [authLoading, activeStore]);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (!settings) return;
    setBuyDraft({
      defaultCashPercent: settings.defaultCashPercent,
      defaultTradePercent: settings.defaultTradePercent,
      slabCashPercent: settings.slabCashPercent,
      slabTradePercent: settings.slabTradePercent,
      manualReviewThreshold: settings.manualReviewThreshold,
      minimumOffer: settings.minimumOffer,
    });
    setConditionDraft({ ...settings.conditionMultipliers });
  }, [settings]);

  useEffect(() => {
    if (!saveMessage) return;
    const timer = window.setTimeout(() => setSaveMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [saveMessage]);

  async function seedDefaults() {
    for (const rule of DEFAULT_STORE_RULES) {
      await adminFetch("/api/admin/rules", {
        method: "POST",
        body: JSON.stringify(rule),
      });
    }
    await loadRules();
  }

  async function saveRule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const ruleType = String(form.get("ruleType")) as RuleType;
    const structuredFilters: Record<string, unknown> = {};

    const minPurchasePrice = String(form.get("minPurchasePrice") ?? "").trim();
    const rarities = String(form.get("rarities") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (ruleType === "min_purchase_price" && minPurchasePrice) {
      structuredFilters.minMarketPrice = Number(minPurchasePrice);
      if (rarities.length) structuredFilters.rarities = rarities;
    }
    if (ruleType === "rarity_buy_override" && rarities.length) {
      structuredFilters.rarities = rarities;
    }

    const res = await adminFetch("/api/admin/rules", {
      method: "POST",
      body: JSON.stringify({
        title: form.get("title"),
        ruleType,
        ruleText: form.get("ruleText"),
        priority: Number(form.get("priority") ?? 0),
        active: form.get("active") === "on",
        appliesToCategories: form.get("categories")
          ? String(form.get("categories")).split(",").map((s) => s.trim())
          : [],
        cashPercentOverride: form.get("cashPercent")
          ? Number(form.get("cashPercent"))
          : undefined,
        tradePercentOverride: form.get("tradePercent")
          ? Number(form.get("tradePercent"))
          : undefined,
        structuredFilters:
          Object.keys(structuredFilters).length > 0 ? structuredFilters : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to save rule");
      return;
    }
    setShowRuleForm(false);
    await loadRules();
  }

  async function toggleRuleActive(rule: StoreRule) {
    setError(null);
    const res = await adminFetch("/api/admin/rules", {
      method: "PATCH",
      body: JSON.stringify({ id: rule.id, active: !rule.active }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to update rule");
      return;
    }
    await loadRules();
  }

  async function deleteRule(rule: StoreRule) {
    if (
      !window.confirm(
        `Delete rule "${rule.title}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    const res = await adminFetch(`/api/admin/rules?id=${encodeURIComponent(rule.id)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to delete rule");
      return;
    }
    await loadRules();
  }

  async function saveBuyPercents(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!buyDraft) return;
    setError(null);
    setSaveMessage(null);
    setSavingBuy(true);
    try {
      const res = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(buyDraft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      setSettings(data.settings);
      setSaveMessage("Buy percentages saved.");
    } finally {
      setSavingBuy(false);
    }
  }

  async function saveConditions(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!conditionDraft) return;
    setError(null);
    setSaveMessage(null);
    setSavingConditions(true);
    try {
      const res = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ conditionMultipliers: conditionDraft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      setSettings(data.settings);
      setSaveMessage("Condition multipliers saved.");
    } finally {
      setSavingConditions(false);
    }
  }

  return (
    <AdminLayout>
      <AdminPricingHeader />

      <div className="mt-4">
        <AdminPricingSubNav />
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {saveMessage && (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {saveMessage}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : (
        <div className="mt-6">
          {section === "rules" && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-800">Store rules</h3>
                <div className="flex gap-2">
                  {rules.length === 0 && (
                    <Button variant="secondary" onClick={() => void seedDefaults()}>
                      Seed defaults
                    </Button>
                  )}
                  <Button onClick={() => setShowRuleForm(!showRuleForm)}>
                    Add rule
                  </Button>
                </div>
              </div>

              {showRuleForm && (
                <form
                  onSubmit={saveRule}
                  className="mt-4 space-y-3 rounded-xl border bg-white p-4"
                >
                  <input
                    name="title"
                    placeholder="Title"
                    required
                    className="w-full rounded-lg border px-3 py-2"
                  />
                  <select
                    name="ruleType"
                    className="w-full rounded-lg border px-3 py-2"
                    value={newRuleType}
                    onChange={(e) => setNewRuleType(e.target.value as RuleType)}
                  >
                    {RULE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {RULE_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <textarea
                    name="ruleText"
                    placeholder="Rule text (shown to staff)"
                    required
                    className="w-full rounded-lg border px-3 py-2"
                    rows={3}
                  />
                  {(newRuleType === "min_purchase_price" ||
                    newRuleType === "rarity_buy_override") && (
                    <input
                      name="rarities"
                      placeholder="Rarities (comma-separated, e.g. common, uncommon, rare, mythic)"
                      className="w-full rounded-lg border px-3 py-2"
                    />
                  )}
                  {newRuleType === "min_purchase_price" && (
                    <input
                      name="minPurchasePrice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Minimum market price to purchase ($)"
                      className="w-full rounded-lg border px-3 py-2"
                    />
                  )}
                  {newRuleType === "adjust_percentage" && (
                    <>
                      <input
                        name="cashPercent"
                        type="number"
                        step="0.01"
                        placeholder="Cash % override (0.4 = 40%)"
                        className="w-full rounded-lg border px-3 py-2"
                      />
                      <input
                        name="tradePercent"
                        type="number"
                        step="0.01"
                        placeholder="Trade % override (0.65 = 65%)"
                        className="w-full rounded-lg border px-3 py-2"
                      />
                    </>
                  )}
                  <input
                    name="categories"
                    placeholder="Categories (comma-separated, blank = all)"
                    className="w-full rounded-lg border px-3 py-2"
                  />
                  <input
                    name="priority"
                    type="number"
                    placeholder="Priority (higher wins conflicts)"
                    defaultValue={0}
                    className="w-full rounded-lg border px-3 py-2"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input name="active" type="checkbox" defaultChecked /> Active
                  </label>
                  <Button type="submit">Save rule</Button>
                </form>
              )}

              <ul className="mt-4 space-y-3">
                {rules.map((rule) => (
                  <li
                    key={rule.id}
                    className={`rounded-xl border bg-white p-4 ${rule.active ? "" : "opacity-60"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{rule.title}</p>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <span
                          className={`text-xs ${rule.active ? "text-green-600" : "text-amber-600"}`}
                        >
                          {rule.active ? "Active" : "Paused"} · P{rule.priority}
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() => void toggleRuleActive(rule)}
                        >
                          {rule.active ? "Pause" : "Resume"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="px-2 py-1 text-xs text-red-700"
                          onClick={() => void deleteRule(rule)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{rule.ruleText}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {RULE_TYPE_LABELS[rule.ruleType] ?? rule.ruleType} ·{" "}
                      {(rule.appliesToCategories as CardCategory[]).join(", ") ||
                        "all categories"}
                      {rule.structuredFilters?.minMarketPrice != null
                        ? ` · min $${rule.structuredFilters.minMarketPrice}`
                        : null}
                      {Array.isArray(rule.structuredFilters?.rarities)
                        ? ` · ${(rule.structuredFilters.rarities as string[]).join(", ")}`
                        : null}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {section === "buy" && buyDraft && (
            <div>
              <h3 className="font-semibold text-slate-800">Buy percentages</h3>
              <form
                onSubmit={saveBuyPercents}
                className="mt-4 max-w-md space-y-4 rounded-xl border bg-white p-4"
              >
                {BUY_PERCENT_FIELDS.map(({ name, label, step }) => (
                  <label key={name} className="block text-sm">
                    {label}
                    <input
                      name={name}
                      type="number"
                      step={step}
                      value={buyDraft[name]}
                      onChange={(e) =>
                        setBuyDraft((current) =>
                          current
                            ? { ...current, [name]: Number(e.target.value) }
                            : current,
                        )
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </label>
                ))}
                <Button type="submit" disabled={savingBuy}>
                  {savingBuy ? "Saving…" : "Save"}
                </Button>
              </form>
            </div>
          )}

          {section === "conditions" && conditionDraft && (
            <div>
              <h3 className="font-semibold text-slate-800">Condition multipliers</h3>
              <p className="mt-1 text-sm text-slate-600">
                Applied to base market price for raw cards.
              </p>
              <form
                onSubmit={saveConditions}
                className="mt-4 max-w-md space-y-4 rounded-xl border bg-white p-4"
              >
                {CONDITIONS.map((c) => (
                  <label key={c} className="block text-sm">
                    <span className="font-medium">
                      {c} — {CONDITION_LABELS[c]}
                    </span>
                    <input
                      name={c}
                      type="number"
                      step="0.01"
                      value={conditionDraft[c]}
                      onChange={(e) =>
                        setConditionDraft((current) =>
                          current
                            ? { ...current, [c]: Number(e.target.value) }
                            : current,
                        )
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    />
                  </label>
                ))}
                <Button type="submit" disabled={savingConditions}>
                  {savingConditions ? "Saving…" : "Save"}
                </Button>
              </form>
            </div>
          )}

          {section === "providers" && (
            <div>
              <h3 className="font-semibold text-slate-800">Pricing providers</h3>
              <p className="mt-1 text-sm text-slate-600">
                Read-only — configured via server environment keys.
              </p>
              <div className="mt-4 space-y-3">
                {PROVIDERS.map((p) => (
                  <div key={p.name} className="rounded-xl border bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{p.name}</p>
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                        {p.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{p.category}</p>
                    <p className="mt-1 text-xs text-gray-500">{p.note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
