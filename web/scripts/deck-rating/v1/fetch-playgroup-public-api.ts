#!/usr/bin/env npx tsx
/**
 * Public Playgroup API: commander snapshot + deck list/record probe.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, fetchJson, fetchText, sha256Bytes, sha256File, snapshotRoot, writeJson } from "./lib";

const BASE = "https://playgroup.gg";

export async function fetchPlaygroupPublicApi(): Promise<Record<string, unknown>> {
  const snap = ensureDir(join(snapshotRoot(), "playgroup", "api"));
  const commanders = await fetchJson<unknown>(`${BASE}/api/public/v1/commanders`);
  const dest = join(snap, "commanders-public-v1.json");
  writeFileSync(dest, commanders.text);
  const parsed = Array.isArray(commanders.json) ? commanders.json : [];
  const guff = (parsed as Array<{ name?: string; id?: number; game_played_count?: number; game_win_count?: number }>).find(
    (r) => r.name === "Commodore Guff",
  );

  const paths = [
    "/api/public/v1/decks",
    "/api/public/v1/decks?per_page=2",
    "/api/public/v1/precons",
    "/api/public/v1/commanders?time_window=30-days",
    "/api/public/v1/openapi.yaml",
    "/api/v2/decks",
    "/api/v2/public_decks",
    "/api/v2/commander_decks",
  ];
  if (guff?.id) {
    paths.push(`/api/public/v1/commanders/${guff.id}`);
    paths.push(`/api/public/v1/commanders/${guff.id}/decks`);
    paths.push(`/api/public/v1/decks?commander_id=${guff.id}`);
    paths.push(`/api/v2/commanders/${guff.id}`);
    paths.push(`/api/v2/commanders/${guff.id}/decks`);
  }

  const probe: Record<string, unknown> = {};
  for (const path of paths) {
    const hit = await fetchJson<unknown>(`${BASE}${path}`).catch((err: Error) => ({
      status: 0,
      json: null,
      text: String(err),
    }));
    probe[path] = { status: hit.status, snippet: (hit.text ?? "").slice(0, 280) };
    await new Promise((r) => setTimeout(r, 120));
  }

  const htmlHits = [];
  for (const url of [
    "https://playgroup.gg/decks",
    "https://playgroup.gg/commanders/2468-commodore-guff",
    "https://playgroup.gg/sets/commander-masters/precons/planeswalker-party",
  ]) {
    const page = await fetchText(url);
    const hrefs = [...page.text.matchAll(/href="([^"]*deck[^"]*)"/gi)].map((m) => m[1]).slice(0, 20);
    htmlHits.push({ url, status: page.status, deckHrefs: hrefs });
    await new Promise((r) => setTimeout(r, 120));
  }

  const deckIds = new Set<string>();
  for (const hit of htmlHits) {
    for (const href of hit.deckHrefs) {
      const m = String(href).match(/\/decks?\/(\d+)/i);
      if (m) deckIds.add(m[1]!);
    }
  }
  const deckReads = [];
  for (const id of [...deckIds].slice(0, 6)) {
    const candidates = [
      `/api/public/v1/decks/${id}`,
      `/api/v2/decks/${id}`,
      `/decks/${id}.json`,
    ];
    for (const path of candidates) {
      const hit = await fetchJson<Record<string, unknown>>(`${BASE}${path}`);
      const json = hit.json ?? {};
      const keys = Object.keys(json);
      const hasList = keys.some((k) => /card|main|list|board/i.test(k)) || Array.isArray((json as { cards?: unknown }).cards);
      const hasRecord = keys.some((k) => /win|loss|played|record|elo/i.test(k));
      deckReads.push({
        path,
        status: hit.status,
        keys: keys.slice(0, 40),
        hasList,
        hasRecord,
        snippet: hit.text.slice(0, 400),
      });
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  const report = {
    commanders: {
      url: `${BASE}/api/public/v1/commanders`,
      status: commanders.status,
      n: parsed.length,
      dest,
      sha256: sha256File(dest),
      sampleKeys: parsed[0] ? Object.keys(parsed[0] as object) : [],
      commodoreGuff: guff ?? null,
      note: "Public, no auth. Counts look like the lifetime / long-window table (not the 30-day HTML tier list).",
    },
    endpointProbe: probe,
    htmlDeckLinks: htmlHits,
    publicDeckReads: deckReads,
    usableAsCasualLabels: deckReads.some((d) => d.hasList && d.hasRecord && d.status === 200)
      ? "Public deck payloads include a list and a win/loss record — snapshot them next."
      : "No public deck payload yet returned both a full list and a win/loss record.",
  };
  writeJson(join(snap, "public-api-probe.json"), report);
  return report;
}

if (require.main === module) {
  fetchPlaygroupPublicApi()
    .then((r) => console.log(JSON.stringify({
      commanders: r.commanders,
      usableAsCasualLabels: r.usableAsCasualLabels,
      deckReads: r.publicDeckReads,
      probeStatuses: Object.fromEntries(
        Object.entries(r.endpointProbe as Record<string, { status?: number }>).map(([k, v]) => [k, v.status]),
      ),
    }, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

void sha256Bytes;
