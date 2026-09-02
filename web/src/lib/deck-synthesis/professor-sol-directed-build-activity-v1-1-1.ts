import type {
  SolDirectedBuildActivityDirectionV111,
  SolDirectedBuildStatusV111,
} from "./professor-sol-directed-build-types-v1-1-1";
import { appendSolDirectedBuildActivityV111 } from "./professor-sol-directed-build-job-store-v1-1-1";

export type SolDirectedAgentFeedV111 = {
  out: (message: string) => Promise<void>;
  in: (message: string) => Promise<void>;
  status: (message: string) => Promise<void>;
  progress: (message: string) => Promise<void>;
};

/** @deprecated Use SolDirectedAgentFeedV111 */
export type SolDirectedThinkFnV111 = (message: string) => Promise<void>;

const FEED_PAYLOAD_MAX = 120_000;

export function sanitizeAgentFeedText(text: string): string {
  return text
    .replace(/\bgpt-[\w.-]+/gi, "")
    .replace(/\bGPT-[\d.]+\s+\w+/gi, "Professor")
    .replace(/\bGPT-5\.6\s+(Sol|Luna)\b/gi, "Professor")
    .replace(/\bYou are Professor\s+Professor\b/gi, "You are Professor")
    .replace(/\(\s*\)\s*—/g, "—")
    .replace(/[^\S\r\n]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function clipAgentFeedText(text: string, max = 1400): string {
  const trimmed = sanitizeAgentFeedText(text);
  if (!trimmed) return "";
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

export function fullAgentFeedText(text: string): string {
  const trimmed = sanitizeAgentFeedText(text);
  if (!trimmed) return "";
  return trimmed.length <= FEED_PAYLOAD_MAX
    ? trimmed
    : `${trimmed.slice(0, FEED_PAYLOAD_MAX)}… [truncated]`;
}

export function formatAgentPromptOutForFeed(prompt: string): string {
  try {
    const obj = JSON.parse(prompt) as Record<string, unknown>;
    return fullAgentFeedText(JSON.stringify(obj, null, 2));
  } catch {
    return fullAgentFeedText(prompt);
  }
}

export function formatAgentSystemOutForFeed(system: string): string {
  return fullAgentFeedText(system);
}

export function formatArchitectResponseInForFeed(raw: Record<string, unknown>): string {
  const lines: string[] = [];
  const thesis = String(raw.strategicThesis ?? raw.deckThesis ?? "").trim();
  if (thesis) lines.push(`Thesis: ${thesis}`);
  const winLines = Array.isArray(raw.winLines) ? raw.winLines : [];
  if (winLines.length > 0) {
    const names = winLines
      .slice(0, 4)
      .map((w) => (w && typeof w === "object" ? String((w as { name?: string }).name ?? "") : ""))
      .filter(Boolean);
    if (names.length) lines.push(`Win lines: ${names.join("; ")}`);
  }
  const reqs = Array.isArray(raw.cardRequirements) ? raw.cardRequirements : [];
  if (reqs.length > 0) {
    lines.push(
      `Requirements (${reqs.length}): ${reqs
        .slice(0, 6)
        .map((r) => {
          if (!r || typeof r !== "object") return "";
          const row = r as { id?: string; count?: number };
          return `${row.id ?? "?"}×${row.count ?? "?"}`;
        })
        .filter(Boolean)
        .join(", ")}${reqs.length > 6 ? "…" : ""}`,
    );
  }
  const budget = raw.constructionBudget as Record<string, unknown> | undefined;
  if (budget) {
    lines.push(
      `Budget: ${budget.nonlandSlots ?? "?"} nonlands + ${budget.landSlots ?? "?"} lands`,
    );
  }
  lines.push("---");
  lines.push(fullAgentFeedText(JSON.stringify(raw, null, 2)));
  return lines.join("\n");
}

export function formatConstructorResponseInForFeed(raw: Partial<Record<string, unknown>>): string {
  const nonlands = Array.isArray(raw.nonlands) ? raw.nonlands : [];
  const lands = Array.isArray(raw.lands) ? raw.lands : [];
  const sample = nonlands
    .slice(0, 8)
    .map((c) => (c && typeof c === "object" ? String((c as { name?: string }).name ?? "") : ""))
    .filter(Boolean);
  const landCopies = lands.reduce((sum, l) => {
    if (!l || typeof l !== "object") return sum;
    return sum + Number((l as { copies?: number }).copies ?? 1);
  }, 0);
  const lines = [
    `Draft: ${nonlands.length} nonlands, ${landCopies} land copies`,
    raw.expectedPlayPattern ? `Play pattern: ${String(raw.expectedPlayPattern)}` : "",
    sample.length ? `Sample nonlands: ${sample.join(", ")}${nonlands.length > 8 ? "…" : ""}` : "",
    "---",
    fullAgentFeedText(JSON.stringify(raw, null, 2)),
  ].filter(Boolean);
  return lines.join("\n");
}

export function formatCriticResponseInForFeed(raw: { summary?: string; swaps?: unknown[] }): string {
  const lines: string[] = [];
  if (raw.summary?.trim()) lines.push(raw.summary.trim());
  const swaps = Array.isArray(raw.swaps) ? raw.swaps : [];
  if (swaps.length > 0) {
    lines.push(
      `Proposed swaps: ${swaps
        .slice(0, 6)
        .map((s) => {
          if (!s || typeof s !== "object") return "";
          const row = s as { cut?: string; add?: string; reason?: string };
          return `${row.cut ?? "?"} → ${row.add ?? "?"}${row.reason ? ` (${row.reason})` : ""}`;
        })
        .filter(Boolean)
        .join("; ")}`,
    );
  }
  lines.push("---");
  lines.push(fullAgentFeedText(JSON.stringify(raw, null, 2)));
  return lines.join("\n");
}

export function formatHeadProfessorResponseInForFeed(raw: Record<string, unknown>): string {
  const lines: string[] = [];
  const grade = raw.grade ?? raw.classification;
  if (grade) lines.push(`Grade: ${String(grade)}`);
  if (raw.classification) lines.push(`Classification: ${String(raw.classification)}`);
  const reasoning = String(raw.reasoningSummary ?? "").trim();
  if (reasoning) lines.push(reasoning);
  const required = Array.isArray(raw.requiredChanges) ? raw.requiredChanges : [];
  if (required.length) lines.push(`Required: ${required.slice(0, 3).join("; ")}`);
  lines.push("---");
  lines.push(fullAgentFeedText(JSON.stringify(raw, null, 2)));
  return lines.join("\n");
}

export function createSolDirectedAgentFeed(args: {
  buildId: string;
  status: SolDirectedBuildStatusV111;
}): SolDirectedAgentFeedV111 {
  const append = async (direction: SolDirectedBuildActivityDirectionV111, message: string) => {
    const cleaned = sanitizeAgentFeedText(message);
    if (!cleaned) return;
    await appendSolDirectedBuildActivityV111({
      buildId: args.buildId,
      status: args.status,
      direction,
      message: cleaned,
    });
  };

  return {
    out: (message) => append("out", message),
    in: (message) => append("in", message),
    status: (message) => append("status", message),
    progress: (message) => append("status", message),
  };
}

/** @deprecated Use createSolDirectedAgentFeed */
export function createSolDirectedThinkFn(args: {
  buildId: string;
  status: SolDirectedBuildStatusV111;
}): SolDirectedThinkFnV111 {
  const feed = createSolDirectedAgentFeed(args);
  return (message) => feed.status(message);
}

export function clipSolDirectedThought(text: string, max = 320): string {
  return clipAgentFeedText(text, max);
}
