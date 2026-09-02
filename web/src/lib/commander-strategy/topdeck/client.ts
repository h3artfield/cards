import type { TopdeckBulkRequest, TopdeckTournament } from "./types";
import type { TopdeckFetchMetrics } from "../types";

const TOPDECK_API_BASE = "https://topdeck.gg/api";

export class TopdeckRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`TopDeck rate limit — retry after ${retryAfterSeconds}s`);
    this.name = "TopdeckRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class TopdeckTransientError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds = 15) {
    super(message);
    this.name = "TopdeckTransientError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class TopdeckClient {
  private apiKey: string;
  private minIntervalMs: number;
  private lastRequestAt = 0;
  readonly metrics: TopdeckFetchMetrics = {
    failedRequests: 0,
    retries: 0,
    rateLimit429Count: 0,
    windows: [],
    requestLog: [],
    splitDepthMax: 0,
    duplicateTidRetrievals: 0,
  };

  constructor(apiKey: string, options?: { minIntervalMs?: number }) {
    if (!apiKey?.trim()) throw new Error("TOPDECK_API_KEY is required (server-side only).");
    this.apiKey = apiKey.trim();
    this.minIntervalMs = options?.minIntervalMs ?? 700;
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  async fetchTournaments(body: TopdeckBulkRequest): Promise<TopdeckTournament[]> {
    await this.throttle();
    const res = await fetch(`${TOPDECK_API_BASE}/v2/tournaments`, {
      method: "POST",
      headers: {
        Authorization: this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      this.metrics.rateLimit429Count += 1;
      throw new TopdeckRateLimitError(parseRetryAfter(res.headers.get("Retry-After")));
    }

    if ([500, 502, 503, 504].includes(res.status)) {
      this.metrics.failedRequests += 1;
      throw new TopdeckTransientError(`TopDeck API ${res.status}`, res.status >= 503 ? 30 : 10);
    }

    if (!res.ok) {
      this.metrics.failedRequests += 1;
      const text = await res.text().catch(() => "");
      throw new Error(`TopDeck API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as TopdeckTournament[] | { error?: string };
    if (!Array.isArray(data)) {
      this.metrics.failedRequests += 1;
      throw new Error(`TopDeck API unexpected response: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return data;
  }
}

function parseRetryAfter(header: string | null): number {
  if (!header) return 60;
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(1, Math.ceil((date - Date.now()) / 1000));
  return 60;
}

export async function testTopdeckConnectivity(apiKey: string): Promise<boolean> {
  try {
    const client = new TopdeckClient(apiKey);
    const now = Math.floor(Date.now() / 1000);
    await client.fetchTournaments({
      game: "Magic: The Gathering",
      format: "EDH",
      start: now - 7 * 86400,
      end: now,
      columns: ["name", "id"],
      rounds: false,
    });
    return true;
  } catch {
    return false;
  }
}
