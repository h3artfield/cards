import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsonOk } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const dir = resolve(process.cwd(), "data/milestones/deck-rating/v1/plan-factory");
  const path = resolve(dir, "status.json");
  const body = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>)
    : { factory: "plan-factory-1.0.0", stage: "waiting", activity: [], deck: null };
  const watcherPath = resolve(dir, "watcher.json");
  if (existsSync(watcherPath)) body.watcher = JSON.parse(readFileSync(watcherPath, "utf8"));
  const fieldPath = resolve(dir, "field.json");
  const strategyPath = resolve(dir, "strategy.json");
  if (existsSync(fieldPath) && existsSync(strategyPath)) {
    const field = JSON.parse(readFileSync(fieldPath, "utf8")) as {
      entries?: Array<{ name: string; winType?: string | null; gaps?: string[]; score?: unknown; scris?: unknown }>;
    };
    const saved = JSON.parse(readFileSync(strategyPath, "utf8")) as {
      strategy?: { explanation?: unknown; win?: { requiredCards?: string[]; type?: string } };
    };
    const strategy = saved.strategy;
    const required = new Set(strategy?.win?.requiredCards ?? []);
    const match = [...(field.entries ?? [])].reverse().find((entry) => required.has(entry.name));
    if (strategy?.win && (match || required.size > 0)) {
      body.shown = {
        name: match?.name ?? strategy.win.requiredCards?.[0] ?? "Latest deck",
        winType: match?.winType ?? strategy.win.type ?? null,
        gaps: match?.gaps ?? [],
        score: match?.score ?? null,
        scris: match?.scris ?? null,
        explanation: strategy.explanation ?? null,
        claim: strategy.win,
      };
    }
  }
  return jsonOk(body);
}
