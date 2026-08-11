"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  EnrichedAdjudicationCard,
  UiAbilityDraft,
  UiActionDraft,
  UiAdjudicationDraft,
  AdjudicationSessionInfo,
} from "@/lib/catalog-coverage/adjudication-types";
import {
  UI_ABILITY_TYPES,
  UI_PRIMITIVES,
} from "@/lib/catalog-coverage/adjudication-types";
import { emptyUiDraft } from "@/lib/catalog-coverage/to-semantic-gold";

const STORAGE_KEY = "catalog-coverage-adjudicator-id";
const ACCESS_STORAGE_KEY = "catalog-coverage-access-token";

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function InstructionPanel() {
  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm leading-relaxed text-amber-50/90">
      <h2 className="text-base font-semibold text-amber-100">Your job</h2>
      <p className="mt-2">
        Describe what the Magic card actually does according to its Oracle text. You are creating
        the human answer key. Do not guess what our AI/parser thinks.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-neutral-700 bg-neutral-900/80 p-3">
          <p className="font-medium text-white">Example — Divination</p>
          <p className="mt-1 text-neutral-400">Sorcery</p>
          <p className="mt-1 italic text-neutral-300">Draw two cards.</p>
          <dl className="mt-3 space-y-1 text-xs text-neutral-300">
            <div><dt className="inline font-medium text-neutral-200">Ability type:</dt> Spell effect</div>
            <div><dt className="inline font-medium text-neutral-200">Action:</dt> Draw</div>
            <div><dt className="inline font-medium text-neutral-200">Quantity:</dt> 2</div>
            <div><dt className="inline font-medium text-neutral-200">Semantic owner:</dt> Source card</div>
            <div><dt className="inline font-medium text-neutral-200">Execution context:</dt> Immediate</div>
            <div><dt className="inline font-medium text-neutral-200">Optional:</dt> No</div>
          </dl>
          <p className="mt-3 text-xs text-neutral-400">
            Whole-card meaning: &quot;This spell causes its controller to draw two cards.&quot;
          </p>
        </div>

        <div className="rounded-lg border border-neutral-700 bg-neutral-900/80 p-3">
          <p className="font-medium text-white">Example — vanilla creature (blank Oracle text)</p>
          <p className="mt-3 text-xs text-neutral-300">
            <span className="font-medium text-neutral-200">Legitimate Magic card</span> = Yes<br />
            <span className="font-medium text-neutral-200">Oracle rules text empty</span> = Yes<br />
            <span className="font-medium text-neutral-200">L2 actions</span> = None
          </p>
          <p className="mt-3 text-xs text-emerald-300/90">
            This is NOT an error or abstention. Zero actions can be the completely correct answer.
          </p>
        </div>
      </div>
    </section>
  );
}

function OracleTextSelector({
  faceId,
  text,
  label,
  onSelect,
  selectedText,
}: {
  faceId: string;
  text: string;
  label: string;
  onSelect: (span: { text: string; start: number; end: number; faceId: string }) => void;
  selectedText?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !ref.current) return;
    const selected = selection.toString().trim();
    if (!selected) return;
    const full = text;
    const start = full.indexOf(selected);
    if (start < 0) return;
    onSelect({ text: selected, start, end: start + selected.length, faceId });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <div
        ref={ref}
        onMouseUp={handleMouseUp}
        className="select-text whitespace-pre-wrap rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-sm leading-relaxed text-neutral-100"
      >
        {text || <span className="text-neutral-500">(empty)</span>}
      </div>
      {selectedText ? (
        <p className="text-xs text-emerald-400">Selected evidence: &quot;{selectedText}&quot;</p>
      ) : (
        <p className="text-xs text-neutral-500">Highlight words in the Oracle text to set evidence.</p>
      )}
    </div>
  );
}

function ActionEditor({
  action,
  faces,
  modalOptions,
  onChange,
  onRemove,
  onEvidenceSelect,
}: {
  action: UiActionDraft;
  faces: EnrichedAdjudicationCard["canonicalStructure"]["faces"];
  modalOptions: string[];
  onChange: (next: UiActionDraft) => void;
  onRemove: () => void;
  onEvidenceSelect: (span: { text: string; start: number; end: number; faceId: string }) => void;
}) {
  const face = faces.find((f) => f.faceId === action.faceId) ?? faces[0];

  return (
    <div className="space-y-3 rounded-lg border border-neutral-700 bg-neutral-900/50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white">Action</p>
        <button type="button" onClick={onRemove} className="text-xs text-red-400 hover:text-red-300">
          Remove
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-xs text-neutral-400">
          Primitive
          <select
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white"
            value={action.primitive}
            onChange={(e) => onChange({ ...action, primitive: e.target.value as UiActionDraft["primitive"] })}
          >
            {UI_PRIMITIVES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-neutral-400">
          Face
          <select
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white"
            value={action.faceId}
            onChange={(e) => onChange({ ...action, faceId: e.target.value })}
          >
            {faces.map((f) => (
              <option key={f.faceId} value={f.faceId}>{f.name} ({f.faceId})</option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-neutral-400">
          Who owns/performs this?
          <select
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white"
            value={action.semanticOwner}
            onChange={(e) => onChange({ ...action, semanticOwner: e.target.value as UiActionDraft["semanticOwner"] })}
          >
            <option value="source_card">Source card</option>
            <option value="granted_object">Granted object</option>
            <option value="created_object">Created object/token</option>
          </select>
        </label>

        <label className="block text-xs text-neutral-400">
          Execution context
          <select
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white"
            value={action.executionContext}
            onChange={(e) => onChange({ ...action, executionContext: e.target.value as UiActionDraft["executionContext"] })}
          >
            <option value="immediate">Immediate</option>
            <option value="granted_ability">Granted ability</option>
            <option value="token_definition">Token definition</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="block text-xs text-neutral-400">
          Optional?
          <select
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white"
            value={action.optional ? "yes" : "no"}
            onChange={(e) => onChange({ ...action, optional: e.target.value === "yes" })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        <label className="block text-xs text-neutral-400">
          Conditional?
          <select
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white"
            value={action.conditional ? "yes" : "no"}
            onChange={(e) => onChange({ ...action, conditional: e.target.value === "yes" })}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        {action.conditional ? (
          <label className="block text-xs text-neutral-400 md:col-span-2">
            Condition text
            <input
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white"
              value={action.conditionText ?? ""}
              onChange={(e) => onChange({ ...action, conditionText: e.target.value })}
            />
          </label>
        ) : null}

        <label className="block text-xs text-neutral-400">
          Modal option
          <select
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white"
            value={action.modalOption}
            onChange={(e) => onChange({ ...action, modalOption: e.target.value })}
          >
            {modalOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>
      </div>

      {face ? (
        <OracleTextSelector
          faceId={face.faceId}
          text={face.oracleText}
          label={`Select evidence on ${face.name}`}
          selectedText={action.evidenceSpan?.text}
          onSelect={(span) => {
            onEvidenceSelect(span);
            onChange({ ...action, evidenceSpan: span, faceId: span.faceId });
          }}
        />
      ) : null}
    </div>
  );
}

function AbilityEditor({
  ability,
  faces,
  modalOptions,
  onChange,
  onRemove,
}: {
  ability: UiAbilityDraft;
  faces: EnrichedAdjudicationCard["canonicalStructure"]["faces"];
  modalOptions: string[];
  onChange: (next: UiAbilityDraft) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-neutral-600 bg-neutral-900 p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-white">Ability</p>
        <button type="button" onClick={onRemove} className="text-xs text-red-400 hover:text-red-300">
          Remove ability
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-xs text-neutral-400">
          Ability type
          <select
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white"
            value={ability.abilityType}
            onChange={(e) => onChange({ ...ability, abilityType: e.target.value as UiAbilityDraft["abilityType"] })}
          >
            {UI_ABILITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-neutral-400">
          Face
          <select
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white"
            value={ability.faceId}
            onChange={(e) => onChange({ ...ability, faceId: e.target.value })}
          >
            {faces.map((f) => (
              <option key={f.faceId} value={f.faceId}>{f.name}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs text-neutral-400">
        Ability paragraph / boundary text
        <textarea
          className="mt-1 min-h-[80px] w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white"
          value={ability.paragraphText}
          onChange={(e) => onChange({ ...ability, paragraphText: e.target.value })}
        />
      </label>

      <div className="space-y-3">
        {ability.actions.map((action) => (
          <ActionEditor
            key={action.id}
            action={action}
            faces={faces}
            modalOptions={modalOptions}
            onChange={(next) =>
              onChange({
                ...ability,
                actions: ability.actions.map((a) => (a.id === action.id ? next : a)),
              })
            }
            onRemove={() =>
              onChange({ ...ability, actions: ability.actions.filter((a) => a.id !== action.id) })
            }
            onEvidenceSelect={() => {}}
          />
        ))}
        <button
          type="button"
          className="rounded border border-neutral-600 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
          onClick={() =>
            onChange({
              ...ability,
              actions: [
                ...ability.actions,
                {
                  id: uid(),
                  primitive: "draw",
                  semanticOwner: "source_card",
                  executionContext: "immediate",
                  optional: false,
                  conditional: false,
                  faceId: ability.faceId,
                  modalOption: "None",
                },
              ],
            })
          }
        >
          + Add Action
        </button>
      </div>
    </div>
  );
}

function AdminDisagreementView() {
  const [data, setData] = useState<{
    quorumReached: boolean;
    adjudicators: string[];
    disagreements: Array<{
      oracleId: string;
      canonicalName: string;
      adjudicatorA: string;
      adjudicatorB: string;
      disagreementType?: string;
      summary: string;
      humanExplanationA?: string;
      humanExplanationB?: string;
    }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/catalog-coverage/admin/disagreements")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Unauthorized");
        return res.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-red-200">
        Admin access required: {error}
      </div>
    );
  }

  if (!data) return <p className="text-neutral-400">Loading disagreement report…</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Calibration disagreement review</h2>
      <p className="text-sm text-neutral-400">
        Quorum reached: {data.quorumReached ? "Yes" : "No"} · Adjudicators: {data.adjudicators.join(", ") || "none"}
      </p>
      {data.disagreements.length === 0 ? (
        <p className="text-emerald-300">No disagreements detected between completed adjudicators.</p>
      ) : (
        <div className="space-y-3">
          {data.disagreements.map((row) => (
            <div key={row.oracleId} className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
              <p className="font-medium text-white">{row.canonicalName}</p>
              <p className="text-xs text-neutral-500">{row.oracleId}</p>
              <p className="mt-2 text-sm text-amber-200">{row.summary} ({row.disagreementType})</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 text-xs text-neutral-300">
                <div>
                  <p className="font-medium text-neutral-200">{row.adjudicatorA}</p>
                  <p className="mt-1 whitespace-pre-wrap">{row.humanExplanationA || "(no explanation)"}</p>
                </div>
                <div>
                  <p className="font-medium text-neutral-200">{row.adjudicatorB}</p>
                  <p className="mt-1 whitespace-pre-wrap">{row.humanExplanationB || "(no explanation)"}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CatalogCoverageAdjudicationApp({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const isAdminView = searchParams.get("view") === "admin";

  const [displayName, setDisplayName] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [accessRequired, setAccessRequired] = useState(true);
  const [adjudicatorId, setAdjudicatorId] = useState<string | null>(null);
  const [session, setSession] = useState<AdjudicationSessionInfo | null>(null);
  const [progress, setProgress] = useState<Record<string, "pending" | "draft" | "submitted">>({});
  const [cardIndex, setCardIndex] = useState(0);
  const [card, setCard] = useState<EnrichedAdjudicationCard | null>(null);
  const [draft, setDraft] = useState<UiAdjudicationDraft | null>(null);
  const [rulings, setRulings] = useState<Array<{ id: string; publishedAt: string; rulingText: string }> | null>(null);
  const [showRulings, setShowRulings] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [bootError, setBootError] = useState<string | null>(null);

  const oracleIds = session?.cardOracleIds ?? [];

  const modalOptions = useMemo(() => {
    if (!card) return ["None"];
    const text = card.canonicalStructure.combinedOracleText;
    const opts = ["None"];
    const matches = text.match(/•[^\n]+/g) ?? [];
    matches.forEach((m, i) => opts.push(`Option ${i + 1}: ${m.slice(0, 48)}…`));
    return opts;
  }, [card]);

  const loadCard = useCallback(
    async (oracleId: string, adjId: string) => {
      const res = await fetch(
        `/api/catalog-coverage/card/${encodeURIComponent(oracleId)}?adjudicatorId=${encodeURIComponent(adjId)}`,
      );
      if (!res.ok) throw new Error("Failed to load card");
      const data = await res.json();
      setCard(data.card);
      setDraft(data.draft?.uiDraft ?? emptyUiDraft(data.card));
      setRulings(null);
      setShowRulings(false);
    },
    [],
  );

  const refreshSession = useCallback(async (adjId: string) => {
    const res = await fetch(`/api/catalog-coverage/session?adjudicatorId=${encodeURIComponent(adjId)}`);
    if (!res.ok) throw new Error("Failed to load session");
    const data = await res.json();
    if (data.sessionStale || !data.session) {
      localStorage.removeItem(STORAGE_KEY);
      setAdjudicatorId(null);
      setSession(null);
      setProgress({});
      return;
    }
    setSession(data.session);
    setProgress(data.progress ?? {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("access");
    if (tokenFromUrl) {
      localStorage.setItem(ACCESS_STORAGE_KEY, tokenFromUrl);
      setAccessToken(tokenFromUrl);
    } else {
      const storedToken = localStorage.getItem(ACCESS_STORAGE_KEY);
      if (storedToken) setAccessToken(storedToken);
    }

    fetch("/api/catalog-coverage/session")
      .then((res) => res.json())
      .then((data) => {
        setAccessRequired(Boolean(data.accessRequired));
        if (data.calibrationBatchHash) {
          // no-op — batch hash verified server-side
        }
      })
      .catch(() => {});

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setAdjudicatorId(stored);
      refreshSession(stored).catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, [refreshSession]);

  useEffect(() => {
    if (!adjudicatorId || oracleIds.length === 0) return;
    const oracleId = oracleIds[cardIndex];
    if (!oracleId) return;
    loadCard(oracleId, adjudicatorId).catch((err: Error) => setBootError(err.message));
  }, [adjudicatorId, oracleIds, cardIndex, loadCard]);

  const persistDraft = useCallback(
    async (nextDraft: UiAdjudicationDraft, submit = false) => {
      if (!adjudicatorId || !card) return;
      setSaveState("saving");
      const res = await fetch("/api/catalog-coverage/adjudication", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adjudicatorId,
          oracleId: card.oracleId,
          samplePosition: card.samplePosition,
          uiDraft: nextDraft,
          submit,
          accessToken: localStorage.getItem(ACCESS_STORAGE_KEY) ?? accessToken,
        }),
      });
      if (!res.ok) {
        setSaveState("error");
        return;
      }
      const data = await res.json();
      setSession(data.session);
      setProgress((prev) => ({ ...prev, [card.oracleId]: submit ? "submitted" : "draft" }));
      setSaveState("saved");
    },
    [adjudicatorId, card],
  );

  useEffect(() => {
    if (!draft || !adjudicatorId || !card) return;
    const timer = setTimeout(() => {
      void persistDraft(draft, false);
    }, 1200);
    return () => clearTimeout(timer);
  }, [draft, adjudicatorId, card, persistDraft]);

  const startSession = async () => {
    setBootError(null);
    const res = await fetch("/api/catalog-coverage/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        accessToken: localStorage.getItem(ACCESS_STORAGE_KEY) ?? accessToken,
      }),
    });
    if (!res.ok) {
      setBootError((await res.json()).error ?? "Failed to start session");
      return;
    }
    const data = await res.json();
    localStorage.setItem(STORAGE_KEY, data.adjudicatorId);
    setAdjudicatorId(data.adjudicatorId);
    setSession(data.session);
    setProgress(data.progress ?? {});
    setCardIndex(0);
  };

  const loadRulings = async () => {
    if (!card) return;
    const res = await fetch(`/api/catalog-coverage/card/${encodeURIComponent(card.oracleId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeRulings: true }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setRulings(data.rulings ?? []);
    setShowRulings(true);
    setDraft((prev) => (prev ? { ...prev, officialRulingsConsulted: true } : prev));
  };

  if (isAdminView) {
    return (
      <div className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100">
        <div className="mx-auto max-w-5xl space-y-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Catalog coverage · admin · {slug}</p>
          <AdminDisagreementView />
        </div>
      </div>
    );
  }

  if (!adjudicatorId || !session) {
    return (
      <div className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100">
        <div className="mx-auto max-w-3xl space-y-4">
          <InstructionPanel />
          <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4">
            <h1 className="text-lg font-semibold text-white">MTG semantic adjudication — calibration</h1>
            <p className="mt-2 text-sm text-neutral-400">
              Enter your name to begin the 35-card protocol calibration batch. Your answers are blind to RC8 and to other adjudicators.
            </p>
            {accessRequired ? (
              <label className="mt-4 block text-sm text-neutral-300">
                Access code
                <input
                  type="password"
                  className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-white"
                  value={accessToken}
                  onChange={(e) => {
                    setAccessToken(e.target.value);
                    localStorage.setItem(ACCESS_STORAGE_KEY, e.target.value);
                  }}
                  placeholder="Provided by study coordinator"
                />
              </label>
            ) : null}
            <label className="mt-4 block text-sm text-neutral-300">
              Your name
              <input
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-white"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alice"
              />
            </label>
            {bootError ? <p className="mt-2 text-sm text-red-400">{bootError}</p> : null}
            <button
              type="button"
              className="mt-4 rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
              onClick={() => void startSession()}
            >
              Start calibration
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (session.allSubmitted) {
    return (
      <div className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100">
        <div className="mx-auto max-w-3xl space-y-4">
          <InstructionPanel />
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-6">
            <h1 className="text-lg font-semibold text-emerald-100">Calibration batch complete</h1>
            <p className="mt-2 text-sm text-neutral-300">
              You submitted all {session.cardsTotal} calibration cards as <strong>{adjudicatorId}</strong>.
              Your answers remain hidden from other adjudicators and from RC8 until disagreements are resolved and the protocol is frozen.
            </p>
            {session.quorumReached ? (
              <p className="mt-3 text-sm text-amber-200">
                Both adjudicators have finished. An admin can review disagreements at{" "}
                <code className="rounded bg-neutral-900 px-1">?view=admin</code> (admin login required).
              </p>
            ) : (
              <p className="mt-3 text-sm text-neutral-400">Waiting for the second adjudicator to complete the same 35 cards.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!card || !draft) {
    return <div className="min-h-screen bg-neutral-950 p-6 text-neutral-400">Loading card…</div>;
  }

  const submittedCount = Object.values(progress).filter((s) => s === "submitted").length;

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100">
      <div className="mx-auto max-w-6xl space-y-4">
        <InstructionPanel />

        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">Calibration · parser-blind gold</p>
            <p className="text-sm text-neutral-300">
              Adjudicator: <span className="text-white">{adjudicatorId}</span> · Card {cardIndex + 1} / {oracleIds.length} · Submitted {submittedCount}/{oracleIds.length}
            </p>
          </div>
          <div className="text-xs text-neutral-500">
            Autosave: {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Error" : "Idle"}
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-3">
            <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-2">
              <p className="px-1 pb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Cards</p>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {oracleIds.map((id, idx) => {
                  const status = progress[id] ?? "pending";
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCardIndex(idx)}
                      className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${
                        idx === cardIndex ? "bg-amber-900/40 text-amber-100" : "text-neutral-400 hover:bg-neutral-800"
                      }`}
                    >
                      <span>{idx + 1}. {status === "submitted" ? "✓" : status === "draft" ? "…" : "○"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {card.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.imageUrl} alt={card.canonicalName} className="w-full rounded-lg border border-neutral-700" />
            ) : null}
            <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-sm">
              <p className="text-lg font-semibold text-white">{card.canonicalName}</p>
              {card.manaCost ? <p className="text-neutral-300">{card.manaCost}</p> : null}
              <p className="text-neutral-400">{card.typeLine ?? card.canonicalStructure.faces[0]?.typeLine}</p>
              {card.layout ? <p className="mt-1 text-xs text-neutral-500">Layout: {card.layout}</p> : null}
            </div>
            {card.rulingsAvailable ? (
              <button
                type="button"
                className="w-full rounded border border-neutral-600 px-3 py-2 text-sm hover:bg-neutral-800"
                onClick={() => void loadRulings()}
              >
                View rulings
              </button>
            ) : null}
            {showRulings && rulings ? (
              <div className="max-h-48 overflow-y-auto rounded border border-neutral-700 bg-neutral-950 p-2 text-xs text-neutral-300">
                {rulings.map((r) => (
                  <p key={r.id} className="mb-2 border-b border-neutral-800 pb-2">{r.rulingText}</p>
                ))}
              </div>
            ) : null}
          </aside>

          <main className="space-y-4">
            <section className="space-y-3 rounded-xl border border-neutral-700 bg-neutral-900 p-4">
              <h2 className="font-medium text-white">Oracle text</h2>
              {card.canonicalStructure.faces.map((face) => (
                <div key={face.faceId} className="rounded border border-neutral-800 p-3">
                  {card.canonicalStructure.faces.length > 1 ? (
                    <p className="mb-2 text-sm font-medium text-amber-200">{face.name} · {face.typeLine}</p>
                  ) : null}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-100">{face.oracleText || "(empty)"}</p>
                </div>
              ))}
            </section>

            <section className="space-y-3 rounded-xl border border-neutral-700 bg-neutral-900 p-4">
              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  checked={draft.noCardNativeL2Actions}
                  onChange={(e) => setDraft({ ...draft, noCardNativeL2Actions: e.target.checked, abilities: e.target.checked ? [] : draft.abilities })}
                />
                This card has no card-native L2 actions
              </label>

              {!draft.noCardNativeL2Actions ? (
                <>
                  {draft.abilities.map((ability) => (
                    <AbilityEditor
                      key={ability.id}
                      ability={ability}
                      faces={card.canonicalStructure.faces}
                      modalOptions={modalOptions}
                      onChange={(next) =>
                        setDraft({ ...draft, abilities: draft.abilities.map((a) => (a.id === ability.id ? next : a)) })
                      }
                      onRemove={() => setDraft({ ...draft, abilities: draft.abilities.filter((a) => a.id !== ability.id) })}
                    />
                  ))}
                  <button
                    type="button"
                    className="rounded border border-neutral-600 px-3 py-2 text-sm hover:bg-neutral-800"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        abilities: [
                          ...draft.abilities,
                          {
                            id: uid(),
                            abilityType: "static",
                            faceId: card.canonicalStructure.faces[0]?.faceId ?? "front",
                            paragraphText: "",
                            actions: [],
                          },
                        ],
                      })
                    }
                  >
                    + Add Ability
                  </button>
                </>
              ) : null}

              <label className="block text-sm text-neutral-300">
                In your own words, what does this card do?
                <textarea
                  className="mt-1 min-h-[100px] w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                  value={draft.humanExplanation}
                  onChange={(e) => setDraft({ ...draft, humanExplanation: e.target.value })}
                  placeholder="Optional for simple cards; strongly encouraged for complex cards."
                />
              </label>
            </section>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={cardIndex <= 0}
                className="rounded border border-neutral-600 px-3 py-2 text-sm disabled:opacity-40"
                onClick={() => setCardIndex((i) => Math.max(0, i - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={cardIndex >= oracleIds.length - 1}
                className="rounded border border-neutral-600 px-3 py-2 text-sm disabled:opacity-40"
                onClick={() => setCardIndex((i) => Math.min(oracleIds.length - 1, i + 1))}
              >
                Next
              </button>
              <button
                type="button"
                className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium hover:bg-emerald-600"
                onClick={() => void persistDraft(draft, true)}
              >
                Submit this card
              </button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
