"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CustomerStoreNavV1 } from "@/components/CustomerStoreNavV1";
import { ProfessorMtgPageShell } from "@/components/professor/ProfessorMtgPageShell";
import { DeckCartDrawerV1 } from "@/components/professor/deck-editor/DeckCartDrawerV1";
import { useCart } from "@/hooks/useCart";
import { tokenLayoutWarningsV1, type TokenBoxV1, type TokenCardV1 } from "@/lib/token-creator/design-v1";
import {
  ensureTokenFontsV1,
  loadTokenImageV1,
  PRINT_SCALE_V1,
  renderTokenBackCanvasV1,
  renderTokenFrontCanvasV1,
  tokenArtPrintRatioV1,
  type TokenLayerIdV1,
} from "@/lib/token-creator/render-v1";
import {
  normalizeTokenBlendWeightV1,
  pickDistinctTokenStylesV1,
  TOKEN_BLEND_WEIGHT_DEFAULT_V1,
  tokenStyleByIdV1,
  tokenStyleLabelV1,
} from "@/lib/token-creator/styles-v1";
import { tokenSetIndexEntryV1 } from "@/lib/token-creator/set-index-v1";
import { applyTokenSetTemplateV1, syncTokenSetCardV1 } from "@/lib/token-creator/set-templates-v1";
import { cardFromDeckTokenV1, defaultSubjectForCardV1, defaultTokenCardV1 } from "@/lib/token-creator/templates-v1";
import type { TokenGalleryViewV1 } from "@/lib/token-creator/gallery-v1";
import type { TokenReferenceV1, TokenStyleModeV1 } from "@/lib/token-creator/types-v1";
import type { TokenDesignViewV1, TokenGenerationViewV1, TokenVersionViewV1 } from "@/lib/token-creator/views-v1";
import { TokenCard3DV1, type TokenCard3DHandleV1 } from "./TokenCard3DV1";
import { TokenCardCanvasV1 } from "./TokenCardCanvasV1";
import { TokenExplodedViewV1 } from "./TokenExplodedViewV1";
import { TokenGalleryV1 } from "./TokenGalleryV1";
import { TokenLayerControlsV1, type TokenControlsTabV1 } from "./TokenLayerControlsV1";
import { TokenLayerListV1 } from "./TokenLayerListV1";
import { TokenPanelStylerV1 } from "./TokenPanelStylerV1";
import { TokenReferenceUploadV1 } from "./TokenReferenceUploadV1";
import { TokenStyleSelectV1 } from "./TokenStyleSelectV1";
import { rememberTokenStyleV1, TokenStyleWheelV1 } from "./TokenStyleWheelV1";
import { TokenTemplatePickerV1, type TokenStartStepV1 } from "./TokenTemplatePickerV1";
import { TokenAssetUrlContextV1 } from "./useTokenAssetsV1";
import { TokenSetBlankV1 } from "./TokenSetBlankV1";
import { useTokenSetSampleV1 } from "./useTokenSetSampleV1";

type Stage = "template" | "design" | "art" | "order";
type DesignSummary = TokenDesignViewV1 & { thumbUrl: string | null };
type Source = { deckId?: string; tokenName?: string } | null;

const UNIT_PRICE = 5;
const POLL_MS = 2500;

const STAGES: Array<[Stage, string]> = [
  ["template", "Template"],
  ["design", "Customize"],
  ["art", "Artwork"],
  ["order", "Order"],
];

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the print file"))), "image/png"),
  );
}

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  try {
    return (await res.json()) as T & { error?: string };
  } catch {
    return {} as T & { error?: string };
  }
}

function isRunning(g: TokenGenerationViewV1 | undefined): boolean {
  return Boolean(g && g.slots.some((s) => s.status === "queued" || s.status === "running"));
}

function initialFromParams(params: URLSearchParams): { card: TokenCardV1; source: Source; fromDeck: boolean } {
  const name = params.get("name");
  const type = params.get("type");
  if (name && type) {
    const colors = (params.get("colors") ?? "").toUpperCase().split("").filter((c) => /[WUBRG]/.test(c));
    const card = cardFromDeckTokenV1({
      name,
      typeLine: type,
      power: params.get("power") ?? undefined,
      toughness: params.get("toughness") ?? undefined,
      colors,
      text: params.get("text") ?? undefined,
    });
    const set = tokenSetIndexEntryV1(params.get("set"));
    return {
      card: set ? applyTokenSetTemplateV1(card, set) : card,
      source: { deckId: params.get("deck") ?? undefined, tokenName: name },
      fromDeck: true,
    };
  }
  return { card: defaultTokenCardV1("creature"), source: null, fromDeck: false };
}

export function TokenCreatorAppV1({ slug }: { slug: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const api = `/api/store/${encodeURIComponent(slug)}/tokens`;
  const cart = useCart(slug);

  const initial = useMemo(() => initialFromParams(new URLSearchParams(params.toString())), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [stage, setStage] = useState<Stage>(initial.fromDeck ? "design" : "template");
  const [designId, setDesignId] = useState<string | null>(null);
  const [card, setCard] = useState<TokenCardV1>(initial.card);
  const [prompt, setPrompt] = useState("");
  const [styleId, setStyleId] = useState<string | null>(null);
  const [blendStyleId, setBlendStyleId] = useState<string | null>(null);
  const [blendOn, setBlendOn] = useState(false);
  const [blendWeight, setBlendWeight] = useState(TOKEN_BLEND_WEIGHT_DEFAULT_V1);
  const [styleMode, setStyleMode] = useState<TokenStyleModeV1>("single");
  const [batchStyleIds, setBatchStyleIds] = useState<Array<string | null>>([null, null, null, null]);
  const [batchSlot, setBatchSlot] = useState(0);
  const [source, setSource] = useState<Source>(initial.source);
  const [reference, setReference] = useState<TokenReferenceV1 | null>(null);

  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [storeName, setStoreName] = useState("");
  const [generations, setGenerations] = useState<TokenGenerationViewV1[]>([]);
  const [versions, setVersions] = useState<Record<string, TokenVersionViewV1>>({});
  const [activeGenId, setActiveGenId] = useState<string | null>(null);
  const [slotView, setSlotView] = useState<Record<string, string>>({});

  const [startStep, setStartStep] = useState<TokenStartStepV1>(0);
  const [buildView, setBuildView] = useState(false);
  const [tab, setTab] = useState<TokenControlsTabV1>("text");
  const [selectedLayer, setSelectedLayer] = useState<TokenLayerIdV1 | null>(null);
  const [busy, setBusy] = useState<null | "saving" | "generating" | "loading" | "cart">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState<{ versionId: string; card: TokenCardV1 } | null>(null);
  const [order, setOrder] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [showDesigns, setShowDesigns] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [gallery, setGallery] = useState<TokenGalleryViewV1[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState<string | null>(null);
  const [shared, setShared] = useState<Record<string, boolean>>({});

  const assetUrl = useCallback((path: string) => `${api}/asset?path=${encodeURIComponent(path)}`, [api]);
  const activeGen = generations.find((g) => g.generationId === activeGenId) ?? generations[generations.length - 1];
  const cardFor = useCallback((v: TokenVersionViewV1) => v.card ?? card, [card]);

  // --- loading -------------------------------------------------------------

  const loadDesigns = useCallback(async () => {
    const res = await fetch(`${api}/designs`, { credentials: "include" });
    const data = await readJson<{ designs?: DesignSummary[]; remainingToday?: number; storeName?: string }>(res);
    if (!res.ok) throw new Error(data.error ?? "Could not load your designs");
    setDesigns(data.designs ?? []);
    setRemaining(data.remainingToday ?? null);
    setStoreName(data.storeName ?? "");
  }, [api]);

  const mergeVersions = (list: TokenVersionViewV1[]) =>
    setVersions((prev) => {
      const next = { ...prev };
      for (const v of list) next[v.versionId] = v;
      return next;
    });

  const openDesign = useCallback(
    async (id: string) => {
      setBusy("loading");
      setError(null);
      try {
        const res = await fetch(`${api}/designs/${encodeURIComponent(id)}`, { credentials: "include" });
        const data = await readJson<{
          design?: TokenDesignViewV1;
          generations?: TokenGenerationViewV1[];
          versions?: TokenVersionViewV1[];
        }>(res);
        if (!res.ok || !data.design) throw new Error(data.error ?? "Could not open that design");
        setDesignId(data.design.designId);
        setCard(data.design.card);
        setPrompt(data.design.prompt);
        setStyleId(data.design.styleId);
        setBlendStyleId(data.design.blendStyleId ?? null);
        setBlendOn(Boolean(data.design.blendStyleId));
        setBlendWeight(normalizeTokenBlendWeightV1(data.design.blendWeight));
        setStyleMode(data.design.styleMode ?? "single");
        setBatchStyleIds(
          data.design.batchStyleIds?.length === 4 ? data.design.batchStyleIds : [data.design.styleId, null, null, null],
        );
        setSource(data.design.source);
        setReference(data.design.reference ?? null);
        setGenerations(data.generations ?? []);
        setVersions(Object.fromEntries((data.versions ?? []).map((v) => [v.versionId, v])));
        setActiveGenId(data.design.latestGenerationId);
        setSlotView({});
        setOrder({});
        setStage((data.generations ?? []).length ? "art" : "design");
        setShowDesigns(false);
        router.replace(`/s/${encodeURIComponent(slug)}/tokens/create?design=${encodeURIComponent(id)}`, { scroll: false });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not open that design");
      } finally {
        setBusy(null);
      }
    },
    [api, router, slug],
  );

  useEffect(() => {
    loadDesigns().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load your designs"));
    const id = params.get("design");
    if (id) void openDesign(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- polling -------------------------------------------------------------

  const pollingId = isRunning(activeGen) ? activeGen!.generationId : null;
  useEffect(() => {
    if (!pollingId) return;
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch(`${api}/generations/${encodeURIComponent(pollingId)}`, { credentials: "include" });
        const data = await readJson<{ generation?: TokenGenerationViewV1; versions?: TokenVersionViewV1[] }>(res);
        if (!active || !res.ok || !data.generation) return;
        mergeVersions(data.versions ?? []);
        setGenerations((prev) => prev.map((g) => (g.generationId === pollingId ? data.generation! : g)));
      } catch {
        /* try again on the next tick */
      }
    };
    const timer = window.setInterval(() => void tick(), POLL_MS);
    void tick();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [api, pollingId]);

  // --- actions -------------------------------------------------------------

  function styleRequest() {
    return {
      styleId,
      blendStyleId: blendOn ? blendStyleId : null,
      blendWeight,
      styleMode,
      batchStyleIds: styleMode === "mixed" ? batchStyleIds : null,
    };
  }

  function setStyleModeAndFill(mode: TokenStyleModeV1) {
    setStyleMode(mode);
    if (mode === "mixed" && batchStyleIds.some((id) => !id)) fillBatch(batchStyleIds);
  }

  /** Fills empty batch slots with styles not already used; slot 1 starts from the wheel's style. */
  function fillBatch(current: Array<string | null>) {
    const start = current[0] ?? (styleId && !current.includes(styleId) ? styleId : null);
    const used = new Set(current.filter((id): id is string => Boolean(id)));
    if (start) used.add(start);
    const extra = pickDistinctTokenStylesV1(12, null).filter((id) => !used.has(id));
    let k = 0;
    setBatchStyleIds(current.map((id, i) => id ?? (i === 0 && start ? start : extra[k++] ?? null)));
  }

  async function saveDesign(cardToSave: TokenCardV1 = card): Promise<string> {
    const res = await fetch(`${api}/designs`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designId, card: cardToSave, prompt, source, reference, ...styleRequest() }),
    });
    const data = await readJson<{ design?: TokenDesignViewV1 }>(res);
    if (!res.ok || !data.design) throw new Error(data.error ?? "Could not save the design");
    setDesignId(data.design.designId);
    if (!designId) {
      router.replace(`/s/${encodeURIComponent(slug)}/tokens/create?design=${encodeURIComponent(data.design.designId)}`, {
        scroll: false,
      });
    }
    return data.design.designId;
  }

  async function save() {
    setBusy("saving");
    setError(null);
    try {
      await saveDesign();
      setNotice("Design saved.");
      void loadDesigns().catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    setBusy("generating");
    setError(null);
    setNotice(null);
    try {
      const id = await saveDesign();
      const res = await fetch(`${api}/generations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId: id, requestId: crypto.randomUUID(), prompt, ...styleRequest(), hq: false }),
      });
      const data = await readJson<{ generation?: TokenGenerationViewV1; remainingToday?: number }>(res);
      if (!res.ok || !data.generation) throw new Error(data.error ?? "Could not start the artwork");
      const gen = data.generation;
      setGenerations((prev) => [...prev.filter((g) => g.generationId !== gen.generationId), gen]);
      setActiveGenId(gen.generationId);
      if (typeof data.remainingToday === "number" && data.remainingToday >= 0) setRemaining(data.remainingToday);
      if (styleMode === "mixed") batchStyleIds.forEach((id) => rememberTokenStyleV1(id));
      else {
        rememberTokenStyleV1(styleId);
        if (blendOn) rememberTokenStyleV1(blendStyleId);
      }
      void loadDesigns().catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the artwork");
    } finally {
      setBusy(null);
    }
  }

  async function requeue(gen: TokenGenerationViewV1, slotIndex: number, action: "retry" | "regenerate") {
    setError(null);
    try {
      const res = await fetch(`${api}/generations/${encodeURIComponent(gen.generationId)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, slots: [slotIndex] }),
      });
      const data = await readJson<{ generation?: TokenGenerationViewV1; remainingToday?: number }>(res);
      if (!res.ok || !data.generation) throw new Error(data.error ?? "Could not start that card again");
      setGenerations((prev) => prev.map((g) => (g.generationId === gen.generationId ? data.generation! : g)));
      setActiveGenId(gen.generationId);
      setSlotView((prev) => {
        const next = { ...prev };
        delete next[`${gen.generationId}:${slotIndex}`];
        return next;
      });
      if (typeof data.remainingToday === "number" && data.remainingToday >= 0) setRemaining(data.remainingToday);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start that card again");
    }
  }

  async function saveVersionCard(versionId: string, next: TokenCardV1 | null) {
    const res = await fetch(`${api}/versions/${encodeURIComponent(versionId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card: next }),
    });
    const data = await readJson<{ version?: TokenVersionViewV1 }>(res);
    if (!res.ok || !data.version) throw new Error(data.error ?? "Could not save this card");
    mergeVersions([data.version]);
  }

  async function deleteDesign(d: DesignSummary) {
    if (!window.confirm(`Delete "${d.name}"? Cards already ordered still print.`)) return;
    const res = await fetch(`${api}/designs/${encodeURIComponent(d.designId)}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) {
      setError("Could not delete that design");
      return;
    }
    setDesigns((prev) => prev.filter((x) => x.designId !== d.designId));
    if (d.designId === designId) startNew();
  }

  function startNew() {
    setDesignId(null);
    setCard(defaultTokenCardV1("creature"));
    setPrompt("");
    setStyleId(null);
    setBlendStyleId(null);
    setBlendOn(false);
    setBlendWeight(TOKEN_BLEND_WEIGHT_DEFAULT_V1);
    setStyleMode("single");
    setBatchStyleIds([null, null, null, null]);
    setBatchSlot(0);
    setSource(null);
    setReference(null);
    setGenerations([]);
    setVersions({});
    setActiveGenId(null);
    setOrder({});
    setStage("template");
    setShowDesigns(false);
    router.replace(`/s/${encodeURIComponent(slug)}/tokens/create`, { scroll: false });
  }

  async function loadGallery() {
    setGalleryLoading(true);
    try {
      const res = await fetch(`${api}/gallery`, { credentials: "include" });
      const data = await readJson<{ entries?: TokenGalleryViewV1[] }>(res);
      if (!res.ok) throw new Error(data.error ?? "Could not load the gallery");
      setGallery(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the gallery");
    } finally {
      setGalleryLoading(false);
    }
  }

  function toggleGallery() {
    setShowDesigns(false);
    setShowGallery((open) => {
      if (!open) void loadGallery();
      return !open;
    });
  }

  async function shareVersion(v: TokenVersionViewV1) {
    const c = cardFor(v);
    if (!window.confirm(`Share “${c.name || "this token"}” to the store gallery? The shop reviews it first; others can then copy its look and prompt.`)) {
      return;
    }
    setGalleryBusy(v.versionId);
    setError(null);
    try {
      await ensureTokenFontsV1(c);
      const art = await loadTokenImageV1(v.artUrl);
      const panelArt = c.panelArt ? await loadTokenImageV1(assetUrl(c.panelArt.path)) : null;
      const symbolArt = c.symbol?.icon === "upload" && c.symbol.path ? await loadTokenImageV1(assetUrl(c.symbol.path)) : null;
      const front = renderTokenFrontCanvasV1(c, {
        art,
        artWidth: art.naturalWidth,
        artHeight: art.naturalHeight,
        scale: 0.8,
        bleed: false,
        panelArt,
        symbolArt,
      });
      const form = new FormData();
      form.set("versionId", v.versionId);
      form.set("title", c.name || "Custom token");
      form.set("card", JSON.stringify(c));
      form.set("preview", await canvasBlob(front), "preview.png");
      const res = await fetch(`${api}/gallery`, { method: "POST", credentials: "include", body: form });
      const data = await readJson<{ entry?: TokenGalleryViewV1 }>(res);
      if (!res.ok || !data.entry) throw new Error(data.error ?? "Could not share that card");
      setShared((prev) => ({ ...prev, [v.versionId]: true }));
      setGallery((prev) => [data.entry!, ...prev]);
      setNotice("Shared. It shows in the store gallery once the shop approves it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share that card");
    } finally {
      setGalleryBusy(null);
    }
  }

  async function copyGalleryEntry(entry: TokenGalleryViewV1) {
    setGalleryBusy(entry.entryId);
    setError(null);
    try {
      const res = await fetch(`${api}/gallery/${encodeURIComponent(entry.entryId)}`, { method: "POST", credentials: "include" });
      const data = await readJson<{ entry?: TokenGalleryViewV1 }>(res);
      if (!res.ok || !data.entry) throw new Error(data.error ?? "Could not open that design");
      const e = data.entry;
      startNew();
      setCard(e.card);
      setPrompt(e.prompt);
      setStyleId(e.styleId);
      setBlendStyleId(e.blendStyleId);
      setBlendOn(Boolean(e.blendStyleId));
      setBlendWeight(normalizeTokenBlendWeightV1(e.blendWeight));
      setBatchStyleIds([e.styleId, null, null, null]);
      setStage("design");
      setShowGallery(false);
      setNotice(
        e.mine
          ? `Started a new design from your “${e.title}”.`
          : `Started from ${e.authorName}'s “${e.title}”. Change anything you like, then generate your own artwork.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that design");
    } finally {
      setGalleryBusy(null);
    }
  }

  async function removeGalleryEntry(entry: TokenGalleryViewV1) {
    if (!window.confirm(`Remove “${entry.title}” from the gallery?`)) return;
    setGalleryBusy(entry.entryId);
    try {
      const res = await fetch(`${api}/gallery/${encodeURIComponent(entry.entryId)}`, { method: "DELETE", credentials: "include" });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error ?? "Could not remove it");
      setGallery((prev) => prev.filter((x) => x.entryId !== entry.entryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove it");
    } finally {
      setGalleryBusy(null);
    }
  }

  async function addToCart() {
    const picked = Object.entries(order).filter(([id, qty]) => versions[id] && qty > 0);
    if (!picked.length) return;
    setBusy("cart");
    setError(null);
    try {
      for (const [versionId, quantity] of picked) {
        const v = versions[versionId]!;
        const c = cardFor(v);
        await ensureTokenFontsV1(c);
        const art = await loadTokenImageV1(v.artUrl);
        const panelArt = c.panelArt ? await loadTokenImageV1(assetUrl(c.panelArt.path)) : null;
        const symbolArt = c.symbol?.icon === "upload" && c.symbol.path ? await loadTokenImageV1(assetUrl(c.symbol.path)) : null;
        const front = renderTokenFrontCanvasV1(c, {
          art,
          artWidth: art.naturalWidth,
          artHeight: art.naturalHeight,
          scale: PRINT_SCALE_V1,
          bleed: true,
          panelArt,
          symbolArt,
        });
        const back = renderTokenBackCanvasV1({ scale: PRINT_SCALE_V1, bleed: true, storeName });
        const form = new FormData();
        form.set("front", await canvasBlob(front), "front.png");
        form.set("back", await canvasBlob(back), "back.png");
        form.set("card", JSON.stringify(c));
        const res = await fetch(`${api}/versions/${encodeURIComponent(versionId)}/snapshot`, {
          method: "POST",
          credentials: "include",
          body: form,
        });
        const data = await readJson<{ snapshotId?: string; previewUrl?: string; name?: string; styleName?: string | null }>(res);
        if (!res.ok || !data.snapshotId) throw new Error(data.error ?? "Could not prepare the print file");
        cart.add({
          inventoryItemId: `token:${data.snapshotId}`,
          name: `${data.name ?? "Custom token"} — custom token`,
          setName: data.styleName ?? "Custom printed token",
          imageUrl: data.previewUrl,
          unitPrice: UNIT_PRICE,
          maxQuantity: 99,
          quantity,
        });
      }
      setOrder({});
      setCartOpen(true);
      setNotice("Added to your cart. Pay from the cart to send them to print.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to cart");
    } finally {
      setBusy(null);
    }
  }

  const toggleOrder = (versionId: string) =>
    setOrder((prev) => {
      const next = { ...prev };
      if (next[versionId]) delete next[versionId];
      else next[versionId] = 1;
      return next;
    });

  // --- derived -------------------------------------------------------------

  const warnings = tokenLayoutWarningsV1(card);
  const matchedSet = tokenSetIndexEntryV1(card.setCode);
  const setSample = useTokenSetSampleV1(card.setCode, card);
  const style = tokenStyleByIdV1(styleId);
  const selectedStyleLabel = blendOn && blendStyleId
    ? `${tokenStyleLabelV1(styleId, blendStyleId)} blend`
    : style
      ? `${style.name} style`
      : null;
  const subject = defaultSubjectForCardV1(card);
  const panelPreviewArt =
    activeGen?.slots.map((s) => (s.versionId ? versions[s.versionId]?.artUrl : undefined)).find(Boolean) ?? null;
  const orderCount = Object.values(order).reduce((n, q) => n + q, 0);
  const finishedVersions = generations
    .slice()
    .reverse()
    .flatMap((g) => g.slots.flatMap((s) => s.history.slice().reverse()))
    .map((id) => versions[id])
    .filter((v): v is TokenVersionViewV1 => Boolean(v));
  const generationsLeft = remaining === null ? null : Math.floor(remaining / 4);
  const expandedVersion = expanded ? versions[expanded] : undefined;

  const moveLayer = (layer: "title" | "type" | "rules" | "pt", box: TokenBoxV1) =>
    setCard((c) => ({ ...c, [layer]: { ...c[layer], box } }));
  const selectLayer = (layer: TokenLayerIdV1) => {
    setSelectedLayer(layer);
    setTab(layer);
  };

  return (
    <TokenAssetUrlContextV1.Provider value={assetUrl}>
    <ProfessorMtgPageShell>
      <div className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-10 sm:px-6 lg:px-10">
        <CustomerStoreNavV1 slug={slug} active="tokens" />

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="professor-mtg-title text-3xl">Token Creator</h1>
            <p className="professor-mtg-muted mt-2 max-w-2xl text-sm">
              Design your own token, generate four AI artworks, and order real printed cards — ${UNIT_PRICE} each.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="deck-toolbar-chip"
              onClick={() => {
                setShowGallery(false);
                setShowDesigns((v) => !v);
              }}
              aria-expanded={showDesigns}
            >
              My token designs{designs.length ? ` (${designs.length})` : ""}
            </button>
            <button type="button" className="deck-toolbar-chip" onClick={toggleGallery} aria-expanded={showGallery}>
              Store gallery
            </button>
            <button type="button" className="deck-toolbar-chip" onClick={startNew}>
              New design
            </button>
            <button type="button" className="deck-toolbar-chip" onClick={() => setCartOpen(true)}>
              View cart{cart.count ? ` (${cart.count})` : ""}
            </button>
          </div>
        </div>

        {showDesigns ? (
          <div className="professor-mtg-card mt-4 p-4">
            {designs.length === 0 ? (
              <p className="professor-mtg-muted text-sm">No saved designs yet. Designs save when you generate artwork.</p>
            ) : (
              <ul className="token-designs">
                {designs.map((d) => (
                  <li key={d.designId} className={`token-design${d.designId === designId ? " token-design--on" : ""}`}>
                    <button type="button" className="token-design__open" onClick={() => void openDesign(d.designId)}>
                      {d.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.thumbUrl} alt="" className="token-design__thumb" loading="lazy" />
                      ) : (
                        <TokenCardCanvasV1 card={d.card} width={64} />
                      )}
                      <span className="token-design__name">{d.name}</span>
                    </button>
                    <button type="button" className="token-link text-[11px]" onClick={() => void deleteDesign(d)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {showGallery ? (
          <TokenGalleryV1
            entries={gallery}
            loading={galleryLoading}
            busyId={galleryBusy}
            onUse={(e) => void copyGalleryEntry(e)}
            onRemove={(e) => void removeGalleryEntry(e)}
          />
        ) : null}

        {source?.tokenName ? (
          <p className="token-banner mt-4">
            Designing <strong>{source.tokenName}</strong> for your deck. The name, type and rules are filled in from the token
            card — change anything you like.
            {source.deckId ? (
              <>
                {" "}
                <Link href={`/s/${encodeURIComponent(slug)}/decks/${encodeURIComponent(source.deckId)}`} className="token-link">
                  Back to deck
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        <nav className="token-stepper mt-5" aria-label="Token Creator steps">
          {STAGES.map(([id, label], i) => (
            <button
              key={id}
              type="button"
              className={`token-step${stage === id ? " token-step--on" : ""}`}
              aria-current={stage === id ? "step" : undefined}
              onClick={() => setStage(id)}
            >
              <span className="token-step__n">{i + 1}</span>
              {label}
              {id === "order" && orderCount ? <span className="token-step__badge">{orderCount}</span> : null}
            </button>
          ))}
        </nav>

        {error ? <p className="token-error mt-4">{error}</p> : null}
        {notice ? <p className="token-notice mt-4">{notice}</p> : null}
        {busy === "loading" ? <p className="professor-mtg-muted mt-4 text-sm italic">Opening design…</p> : null}

        {stage === "template" ? (
          <div className="token-layout mt-6">
            <div className="professor-mtg-card min-w-0 p-5">
              <TokenTemplatePickerV1
                slug={slug}
                card={card}
                onChange={setCard}
                step={startStep}
                onStep={setStartStep}
                uploadApi={api}
              />
            </div>
            <aside className="token-preview-col">
              <TokenCardCanvasV1 card={card} width={300} />
              {matchedSet ? (
                <>
                  <p className="token-set-note mt-3">
                    Your token in the <strong>{matchedSet.name}</strong> design
                    {matchedSet.effect === "fullart" ? " (full art)" : ""}. This is the card you&apos;ll customize and print.
                    {matchedSet.setting ? ` Your art will be painted in its style: ${matchedSet.setting}.` : ""}
                  </p>
                  {setSample ? (
                    <figure className="token-set-ref mt-3">
                      <TokenSetBlankV1 set={matchedSet} sample={setSample} width={96} className="token-set-ref__card" />
                      <figcaption>
                        The design you picked, from a real {matchedSet.name} token with its art removed. Your token uses
                        its frame and colours with your own name and text.
                      </figcaption>
                    </figure>
                  ) : null}
                </>
              ) : null}
              <button type="button" className="professor-mtg-btn mt-4 w-full px-4 py-2 text-xs" onClick={() => setStage("design")}>
                Next: customize
              </button>
            </aside>
          </div>
        ) : null}

        {stage === "design" ? (
          <div className="token-layout mt-6">
            <div className="professor-mtg-card min-w-0 p-5">
              {matchedSet ? (
                <p className="token-set-note mb-4">
                  Styled like <strong>{matchedSet.name}</strong> tokens.{" "}
                  <button type="button" className="token-link" onClick={() => setStage("template")}>
                    Change set or look
                  </button>
                </p>
              ) : null}
              <TokenLayerControlsV1
                card={card}
                onChange={(next) => setCard((prev) => syncTokenSetCardV1(prev, next))}
                tab={tab}
                onTab={setTab}
                uploadApi={api}
              />
            </div>
            <aside className="token-preview-col">
              <div className="mb-2 flex gap-1" role="group" aria-label="Preview">
                <button
                  type="button"
                  className={`token-chip${!buildView ? " token-chip--on" : ""}`}
                  aria-pressed={!buildView}
                  onClick={() => setBuildView(false)}
                >
                  Card
                </button>
                <button
                  type="button"
                  className={`token-chip${buildView ? " token-chip--on" : ""}`}
                  aria-pressed={buildView}
                  onClick={() => setBuildView(true)}
                >
                  Build view (layers)
                </button>
              </div>
              {buildView ? (
                <TokenExplodedViewV1 card={card} width={230} selected={selectedLayer} onSelect={selectLayer} />
              ) : (
                <TokenCardCanvasV1
                  card={card}
                  width={320}
                  guides
                  selectedLayer={selectedLayer}
                  onSelectLayer={(layer) => {
                    setSelectedLayer(layer);
                    if (layer) setTab(layer);
                  }}
                  onMoveLayer={moveLayer}
                />
              )}
              <p className="professor-mtg-muted mt-2 text-[11px] leading-snug">
                {buildView
                  ? "Your card pulled apart into its layers, bottom to top. Click a label to edit that layer."
                  : "Drag the name, type line, rules box or P/T to move them. The dashed line is the safe margin — keep text inside it. The art placeholder is replaced by your artwork in the next step."}
              </p>
              <TokenLayerListV1
                card={card}
                onChange={(next) => setCard((prev) => syncTokenSetCardV1(prev, next))}
                selected={selectedLayer}
                onSelect={selectLayer}
              />
              {warnings.length ? (
                <ul className="token-warnings mt-2">
                  {warnings.map((w, i) => (
                    <li key={i}>
                      <strong>{w.layer}:</strong> {w.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4 flex gap-2">
                <button type="button" className="deck-toolbar-chip" disabled={busy !== null} onClick={() => void save()}>
                  {busy === "saving" ? "Saving…" : "Save design"}
                </button>
                <button type="button" className="professor-mtg-btn flex-1 px-4 py-2 text-xs" onClick={() => setStage("art")}>
                  Next: artwork
                </button>
              </div>
            </aside>
          </div>
        ) : null}

        {stage === "art" ? (
          <div className="mt-6 space-y-6">
            <div className="professor-mtg-card p-5">
              <label className="token-field">
                <span className="token-section-title">Describe the artwork</span>
                <textarea
                  className="token-input token-textarea"
                  rows={3}
                  maxLength={1500}
                  value={prompt}
                  placeholder={`Leave empty for: ${subject}`}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <span className="token-field__hint">
                  Describe the subject, mood and setting. The card&apos;s name and rules are added by the template, so the art
                  is made without any lettering.
                </span>
              </label>

              <TokenReferenceUploadV1
                api={api}
                assetUrl={assetUrl}
                value={reference}
                onChange={setReference}
                disabled={busy !== null || isRunning(activeGen)}
              />

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <h3 className="token-section-title">Art style</h3>
                <div className="token-segment" role="radiogroup" aria-label="How styles are used">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={styleMode === "single"}
                    className={`token-chip${styleMode === "single" ? " token-chip--on" : ""}`}
                    onClick={() => setStyleModeAndFill("single")}
                  >
                    One style for all four
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={styleMode === "mixed"}
                    className={`token-chip${styleMode === "mixed" ? " token-chip--on" : ""}`}
                    onClick={() => setStyleModeAndFill("mixed")}
                  >
                    Four different styles
                  </button>
                </div>
              </div>

              {matchedSet && styleMode === "single" ? (
                <div className="token-set-style mt-3">
                  <button
                    type="button"
                    className={`token-chip${!styleId ? " token-chip--on" : ""}`}
                    aria-pressed={!styleId}
                    onClick={() => {
                      setStyleId(null);
                      setBlendOn(false);
                    }}
                  >
                    Paint it like {matchedSet.name}
                  </button>
                  <span className="professor-mtg-muted text-[11px]">
                    {!styleId
                      ? `Uses the look of ${matchedSet.name}'s own token art${matchedSet.setting ? ` (${matchedSet.setting})` : ""}.`
                      : `Your style is used, set in ${matchedSet.name}'s world.`}
                  </span>
                </div>
              ) : null}

              {styleMode === "mixed" ? (
                <div className="token-batch mt-3">
                  <p className="professor-mtg-muted text-[12px]">
                    Each image gets its own style. Pick an image, then choose its style on the wheel or from the list.
                  </p>
                  <div className="token-batch__slots">
                    {batchStyleIds.map((id, i) => (
                      <div key={i} className={`token-batch__slot${batchSlot === i ? " token-batch__slot--on" : ""}`}>
                        <button type="button" className="token-batch__pick" onClick={() => setBatchSlot(i)} aria-pressed={batchSlot === i}>
                          <span className="token-batch__n">Image {i + 1}</span>
                          <span className="token-batch__name">{tokenStyleByIdV1(id)?.name ?? "No style yet"}</span>
                        </button>
                        <TokenStyleSelectV1
                          label={`Style for image ${i + 1}`}
                          value={id}
                          onChange={(next) => {
                            setBatchSlot(i);
                            setBatchStyleIds((prev) => prev.map((x, j) => (j === i ? next : x)));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="deck-toolbar-chip" onClick={() => fillBatch([null, null, null, null])}>
                      Surprise me with 4 styles
                    </button>
                    <button
                      type="button"
                      className="deck-toolbar-chip"
                      onClick={() => fillBatch(batchStyleIds.map((id, i) => (i === batchSlot ? id : null)))}
                    >
                      Keep image {batchSlot + 1}, shuffle the rest
                    </button>
                  </div>
                </div>
              ) : null}

              <TokenStyleWheelV1
                value={styleMode === "mixed" ? batchStyleIds[batchSlot] ?? null : styleId}
                onChange={(next) => {
                  if (styleMode === "mixed") setBatchStyleIds((prev) => prev.map((x, j) => (j === batchSlot ? next : x)));
                  else setStyleId(next);
                }}
              />

              {styleMode === "single" ? (
                <div className="token-blend mt-4">
                  <label className="token-toggle">
                    <input
                      type="checkbox"
                      checked={blendOn}
                      onChange={(e) => setBlendOn(e.target.checked)}
                      disabled={!styleId}
                    />
                    <span>Blend in a second style</span>
                  </label>
                  {!styleId ? <span className="professor-mtg-muted text-[11px]">Pick a style on the wheel first.</span> : null}
                  {blendOn && styleId ? (
                    <div className="token-blend__body">
                      <TokenStyleSelectV1
                        label="Second style"
                        value={blendStyleId}
                        exclude={styleId}
                        emptyLabel="Choose the second style…"
                        onChange={setBlendStyleId}
                      />
                      <button
                        type="button"
                        className="token-link"
                        onClick={() => setBlendStyleId(pickDistinctTokenStylesV1(2, styleId)[1] ?? null)}
                      >
                        Surprise me
                      </button>
                      {blendStyleId ? (
                        <label className="token-field token-blend__mix">
                          <span className="token-field__label">Mix</span>
                          <span className="token-range">
                            <span className="token-range__value">
                              {Math.round((1 - blendWeight) * 100)}% {style?.name}
                            </span>
                            <input
                              type="range"
                              min={0.2}
                              max={0.8}
                              step={0.05}
                              value={blendWeight}
                              aria-label="Share of the second style"
                              onChange={(e) => setBlendWeight(normalizeTokenBlendWeightV1(Number(e.target.value)))}
                            />
                            <span className="token-range__value">
                              {Math.round(blendWeight * 100)}% {tokenStyleByIdV1(blendStyleId)?.name}
                            </span>
                          </span>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="token-generate">
                <button
                  type="button"
                  className="professor-mtg-btn px-6 py-3 text-sm"
                  disabled={
                    busy !== null ||
                    isRunning(activeGen) ||
                    generationsLeft === 0 ||
                    (styleMode === "mixed" && batchStyleIds.some((id) => !id)) ||
                    Boolean(reference && !reference.use.trim())
                  }
                  onClick={() => void generate()}
                >
                  {busy === "generating"
                    ? "Starting…"
                    : isRunning(activeGen)
                      ? "Painting your tokens…"
                      : styleMode === "mixed"
                        ? "Generate 4 Tokens in 4 Styles"
                        : "Generate 4 Tokens"}
                </button>
                <p className="professor-mtg-muted text-[12px]">
                  {styleMode === "mixed"
                    ? batchStyleIds.some((id) => !id)
                      ? "Choose a style for every image. "
                      : "Four styles, one per image. "
                    : selectedStyleLabel
                      ? `${selectedStyleLabel}. `
                      : "No style — your prompt only. "}
                  {generationsLeft === null
                    ? ""
                    : generationsLeft > 0
                      ? `${generationsLeft} generation${generationsLeft === 1 ? "" : "s"} left today.`
                      : "You've used today's generations. They reset at midnight UTC."}
                </p>
              </div>
            </div>

            {activeGen ? (
              <section>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="token-section-title">Your four tokens</h3>
                  {generations.length > 1 ? (
                    <label className="professor-mtg-muted flex items-center gap-2 text-[12px]">
                      Earlier batches
                      <select
                        className="token-input token-input--sm"
                        value={activeGen.generationId}
                        onChange={(e) => setActiveGenId(e.target.value)}
                      >
                        {generations
                          .slice()
                          .reverse()
                          .map((g, i) => (
                            <option key={g.generationId} value={g.generationId}>
                              {i === 0 ? "Latest" : new Date(g.createdAt).toLocaleString()} ·{" "}
                              {g.styleMode === "mixed" ? "4 styles" : tokenStyleLabelV1(g.styleId, g.blendStyleId) ?? "no style"}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <div className="token-slots mt-3">
                  {activeGen.slots.map((slot) => {
                    const key = `${activeGen.generationId}:${slot.slotIndex}`;
                    const shownId = slotView[key] ?? slot.versionId ?? slot.history[slot.history.length - 1] ?? null;
                    const v = shownId ? versions[shownId] : undefined;
                    const histIndex = shownId ? slot.history.indexOf(shownId) : -1;
                    const working = slot.status === "queued" || slot.status === "running";
                    const slotStyle =
                      activeGen.styleMode === "mixed" || slot.blendStyleId ? tokenStyleLabelV1(slot.styleId, slot.blendStyleId) : null;
                    return (
                      <div key={key} className="token-slot">
                        {slotStyle ? <p className="token-slot__style">{slotStyle}</p> : null}
                        {v && !working ? (
                          <>
                            <button
                              type="button"
                              className="token-slot__card"
                              onClick={() => setExpanded(v.versionId)}
                              aria-label="Open this token larger"
                            >
                              <TokenCard3DV1 card={cardFor(v)} artUrl={v.artUrl} storeName={storeName} height={300} />
                            </button>
                            {slot.history.length > 1 ? (
                              <div className="token-slot__history">
                                <button
                                  type="button"
                                  disabled={histIndex <= 0}
                                  onClick={() => setSlotView((p) => ({ ...p, [key]: slot.history[histIndex - 1]! }))}
                                  aria-label="Earlier version"
                                >
                                  ‹
                                </button>
                                <span>
                                  Version {histIndex + 1} of {slot.history.length}
                                </span>
                                <button
                                  type="button"
                                  disabled={histIndex >= slot.history.length - 1}
                                  onClick={() => setSlotView((p) => ({ ...p, [key]: slot.history[histIndex + 1]! }))}
                                  aria-label="Later version"
                                >
                                  ›
                                </button>
                              </div>
                            ) : null}
                            <div className="token-slot__actions">
                              <label className="token-toggle">
                                <input type="checkbox" checked={Boolean(order[v.versionId])} onChange={() => toggleOrder(v.versionId)} />
                                <span>Order this</span>
                              </label>
                              <button type="button" className="token-link" onClick={() => setCustomizing({ versionId: v.versionId, card: cardFor(v) })}>
                                Customize
                              </button>
                              <button
                                type="button"
                                className="token-link"
                                disabled={isRunning(activeGen) || generationsLeft === 0}
                                onClick={() => void requeue(activeGen, slot.slotIndex, "regenerate")}
                              >
                                Regenerate
                              </button>
                              <button
                                type="button"
                                className="token-link"
                                disabled={galleryBusy === v.versionId || shared[v.versionId]}
                                onClick={() => void shareVersion(v)}
                              >
                                {shared[v.versionId] ? "Shared" : galleryBusy === v.versionId ? "Sharing…" : "Share to gallery"}
                              </button>
                            </div>
                          </>
                        ) : working ? (
                          <div className="token-slot__pending" aria-live="polite">
                            <span className="token-spinner" aria-hidden />
                            <span>{slot.status === "queued" ? "Waiting to paint…" : "Painting…"}</span>
                            <span className="professor-mtg-muted text-[11px]">Usually under a minute</span>
                          </div>
                        ) : (
                          <div className="token-slot__pending token-slot__pending--failed">
                            <span>This one didn&apos;t come out.</span>
                            {slot.error ? <span className="text-[11px]">{slot.error}</span> : null}
                            <button
                              type="button"
                              className="deck-toolbar-chip mt-2"
                              onClick={() => void requeue(activeGen, slot.slotIndex, "retry")}
                            >
                              Try again
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {Object.keys(order).length ? (
                  <div className="mt-4 flex justify-end">
                    <button type="button" className="professor-mtg-btn px-5 py-2 text-xs" onClick={() => setStage("order")}>
                      Next: order {orderCount} card{orderCount === 1 ? "" : "s"}
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}

            <div className="professor-mtg-card p-5">
              <TokenPanelStylerV1
                api={api}
                card={card}
                artUrl={panelPreviewArt}
                styleId={styleMode === "mixed" ? batchStyleIds[0] ?? null : styleId}
                blendStyleId={styleMode === "single" && blendOn ? blendStyleId : null}
                blendWeight={blendWeight}
                disabled={busy !== null || remaining === 0}
                onChange={setCard}
                onApply={async (next) => {
                  setCard(next);
                  try {
                    await saveDesign(next);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not save the design");
                  }
                }}
                onRemaining={setRemaining}
              />
              {Object.values(versions).some((v) => v.card) ? (
                <p className="professor-mtg-muted mt-2 text-[11px]">
                  Cards you customized on their own keep their own panels; open Customize on them to update.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {stage === "order" ? (
          <div className="professor-mtg-card mt-6 p-5">
            <h3 className="token-section-title">Choose what to print</h3>
            <p className="professor-mtg-muted mb-4 text-[12px]">
              Tick the designs you want and how many of each. UV-printed on a standard 63×88 mm card with the feel of a real
              token, and stamped on the back as a custom token — ${UNIT_PRICE.toFixed(2)} per card.
            </p>
            {finishedVersions.length === 0 ? (
              <p className="professor-mtg-muted text-sm">Generate some artwork first, then pick your favourites here.</p>
            ) : (
              <ul className="token-order-grid">
                {finishedVersions.map((v) => {
                  const qty = order[v.versionId] ?? 0;
                  return (
                    <li key={v.versionId} className={`token-order-item${qty ? " token-order-item--on" : ""}`}>
                      <button type="button" onClick={() => setExpanded(v.versionId)} aria-label="Open larger">
                        <TokenCardCanvasV1 card={cardFor(v)} artUrl={v.artUrl} width={150} />
                      </button>
                      <label className="token-toggle mt-2">
                        <input type="checkbox" checked={qty > 0} onChange={() => toggleOrder(v.versionId)} />
                        <span>{tokenStyleLabelV1(v.styleId, v.blendStyleId) ?? "No style"}</span>
                      </label>
                      {qty ? (
                        <span className="token-qty">
                          <button
                            type="button"
                            aria-label="One fewer"
                            onClick={() => setOrder((p) => ({ ...p, [v.versionId]: Math.max(1, qty - 1) }))}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={qty}
                            aria-label="Quantity"
                            onChange={(e) =>
                              setOrder((p) => ({ ...p, [v.versionId]: Math.min(99, Math.max(1, Math.trunc(Number(e.target.value)) || 1)) }))
                            }
                          />
                          <button
                            type="button"
                            aria-label="One more"
                            onClick={() => setOrder((p) => ({ ...p, [v.versionId]: Math.min(99, qty + 1) }))}
                          >
                            +
                          </button>
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="token-order-total">
              <span>
                {orderCount} card{orderCount === 1 ? "" : "s"} × ${UNIT_PRICE.toFixed(2)} ={" "}
                <strong>${(orderCount * UNIT_PRICE).toFixed(2)}</strong>
              </span>
              <button
                type="button"
                className="professor-mtg-btn px-5 py-2 text-xs"
                disabled={!orderCount || busy !== null}
                onClick={() => void addToCart()}
              >
                {busy === "cart" ? "Preparing print files…" : "Add to cart"}
              </button>
            </div>
            <p className="professor-mtg-muted mt-2 text-[11px]">
              Shipping or pickup is chosen at checkout. Printing starts once payment goes through.
            </p>
          </div>
        ) : null}
      </div>

      {expandedVersion ? (
        <ExpandedViewer
          version={expandedVersion}
          card={cardFor(expandedVersion)}
          storeName={storeName}
          ordered={Boolean(order[expandedVersion.versionId])}
          onToggleOrder={() => toggleOrder(expandedVersion.versionId)}
          onCustomize={() => {
            setCustomizing({ versionId: expandedVersion.versionId, card: cardFor(expandedVersion) });
            setExpanded(null);
          }}
          onClose={() => setExpanded(null)}
        />
      ) : null}

      {customizing && versions[customizing.versionId] ? (
        <CustomizeDialog
          version={versions[customizing.versionId]!}
          card={customizing.card}
          hasOverride={Boolean(versions[customizing.versionId]!.card)}
          onChange={(c) => setCustomizing({ ...customizing, card: c })}
          onClose={() => setCustomizing(null)}
          onSave={async (scope) => {
            try {
              if (scope === "card") await saveVersionCard(customizing.versionId, customizing.card);
              else if (scope === "reset") await saveVersionCard(customizing.versionId, null);
              else {
                await saveDesign(customizing.card);
                setCard(customizing.card);
              }
              setCustomizing(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save");
            }
          }}
        />
      ) : null}

      <DeckCartDrawerV1 slug={slug} open={cartOpen} onClose={() => setCartOpen(false)} />
    </ProfessorMtgPageShell>
    </TokenAssetUrlContextV1.Provider>
  );
}

function useEscape(onClose: () => void) {
  const ref = useRef(onClose);
  useEffect(() => {
    ref.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function ExpandedViewer({
  version,
  card,
  storeName,
  ordered,
  onToggleOrder,
  onCustomize,
  onClose,
}: {
  version: TokenVersionViewV1;
  card: TokenCardV1;
  storeName: string;
  ordered: boolean;
  onToggleOrder: () => void;
  onCustomize: () => void;
  onClose: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const handle = useRef<TokenCard3DHandleV1>(null);
  useEscape(onClose);
  const soft = tokenArtPrintRatioV1(card, version.width, version.height) < 0.75;
  const styleLabel = tokenStyleLabelV1(version.styleId, version.blendStyleId);

  return createPortal(
    <div className="token-modal" role="dialog" aria-modal="true" aria-label="Token viewer" onClick={onClose}>
      <div className="token-modal__panel token-modal__panel--viewer" onClick={(e) => e.stopPropagation()}>
        <div className="token-viewer__stage">
          <TokenCard3DV1 ref={handle} card={card} artUrl={version.artUrl} storeName={storeName} flipped={flipped} orbit height={560} />
        </div>
        <div className="token-viewer__bar">
          <div>
            <p className="font-semibold">{card.name || "Custom token"}</p>
            <p className="professor-mtg-muted text-[11px]">
              {styleLabel ?? "No style"} · drag to turn, scroll to zoom
            </p>
            {soft ? (
              <p className="mt-1 text-[11px] text-[var(--warn,#e0b44c)]">
                The art is zoomed in far enough that it may print slightly soft.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="deck-toolbar-chip" onClick={() => setFlipped((f) => !f)}>
              {flipped ? "Show front" : "Flip"}
            </button>
            <button type="button" className="deck-toolbar-chip" onClick={() => handle.current?.zoom(0.85)} aria-label="Zoom in">
              +
            </button>
            <button type="button" className="deck-toolbar-chip" onClick={() => handle.current?.zoom(1.18)} aria-label="Zoom out">
              −
            </button>
            <button
              type="button"
              className="deck-toolbar-chip"
              onClick={() => {
                setFlipped(false);
                handle.current?.reset();
              }}
            >
              Reset view
            </button>
            <button type="button" className="deck-toolbar-chip" onClick={onCustomize}>
              Customize
            </button>
            <button type="button" className={`deck-toolbar-chip${ordered ? " deck-toolbar-chip--on" : ""}`} onClick={onToggleOrder}>
              {ordered ? "✓ In order" : "Order this"}
            </button>
            <button type="button" className="deck-toolbar-chip" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CustomizeDialog({
  version,
  card,
  hasOverride,
  onChange,
  onSave,
  onClose,
}: {
  version: TokenVersionViewV1;
  card: TokenCardV1;
  hasOverride: boolean;
  onChange: (card: TokenCardV1) => void;
  onSave: (scope: "card" | "design" | "reset") => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TokenControlsTabV1>("art");
  const [layer, setLayer] = useState<TokenLayerIdV1 | null>(null);
  const [saving, setSaving] = useState(false);
  useEscape(onClose);
  const warnings = tokenLayoutWarningsV1(card);
  const run = async (scope: "card" | "design" | "reset") => {
    setSaving(true);
    await onSave(scope);
    setSaving(false);
  };

  return createPortal(
    <div className="token-modal" role="dialog" aria-modal="true" aria-label="Customize this token" onClick={onClose}>
      <div className="token-modal__panel token-modal__panel--edit" onClick={(e) => e.stopPropagation()}>
        <div className="token-layout">
          <div className="min-w-0">
            <TokenLayerControlsV1 card={card} onChange={onChange} tab={tab} onTab={setTab} />
          </div>
          <aside className="token-preview-col">
            <TokenCardCanvasV1
              card={card}
              artUrl={version.artUrl}
              width={300}
              guides
              selectedLayer={layer}
              onSelectLayer={(l) => {
                setLayer(l);
                if (l) setTab(l);
              }}
              onMoveLayer={(l, box) => onChange({ ...card, [l]: { ...card[l], box } })}
            />
            <TokenLayerListV1
              card={card}
              onChange={onChange}
              selected={layer}
              onSelect={(l) => {
                setLayer(l);
                setTab(l);
              }}
            />
            {warnings.length ? (
              <ul className="token-warnings mt-2">
                {warnings.map((w, i) => (
                  <li key={i}>
                    <strong>{w.layer}:</strong> {w.message}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className="professor-mtg-btn px-4 py-2 text-xs" disabled={saving} onClick={() => void run("card")}>
                Save for this card only
              </button>
              <button type="button" className="deck-toolbar-chip" disabled={saving} onClick={() => void run("design")}>
                Use these settings for the whole design
              </button>
              {hasOverride ? (
                <button type="button" className="token-link" disabled={saving} onClick={() => void run("reset")}>
                  Go back to the design&apos;s settings
                </button>
              ) : null}
              <button type="button" className="token-link" onClick={onClose}>
                Cancel
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
