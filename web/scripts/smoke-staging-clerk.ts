/**
 * Live smoke test against staging clerk API.
 * Run: npx tsx scripts/smoke-staging-clerk.ts
 */
const BASE =
  process.env.STAGING_URL ??
  "https://buyback-web-staging-rrogeqxyea-uc.a.run.app";
const SLUG = "the-game-lodge";

type ClerkResponse = {
  reply?: string;
  suggestedCards?: unknown[];
  searchQuery?: string;
  classification?: {
    mode?: string;
    answerSource?: string;
    answerSourceLabel?: string;
    redirectToInventorySearch?: string;
  };
  verification?: { status?: string; hard_failures?: string[] };
  deckList?: unknown;
  error?: string;
};

async function clerk(message: string, timeoutMs = 120_000): Promise<ClerkResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${BASE}/api/store/${encodeURIComponent(SLUG)}/inventory/clerk`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: [], filters: {} }),
        signal: controller.signal,
      },
    );
    const data = (await res.json()) as ClerkResponse & { ok?: boolean };
    if (!res.ok) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function suggest(q: string): Promise<{ count: number; sample?: string }> {
  const res = await fetch(
    `${BASE}/api/store/${encodeURIComponent(SLUG)}/inventory/suggest?q=${encodeURIComponent(q)}&limit=5`,
  );
  const data = (await res.json()) as { suggestions?: Array<{ name: string }> };
  const suggestions = data.suggestions ?? [];
  return { count: suggestions.length, sample: suggestions[0]?.name };
}

function pass(label: string, detail: string) {
  console.log(`✓ ${label}`);
  console.log(`  ${detail.slice(0, 200).replace(/\n/g, " ")}`);
}

function fail(label: string, detail: string) {
  console.log(`✗ ${label}`);
  console.log(`  ${detail}`);
  process.exitCode = 1;
}

async function main() {
  console.log(`Staging clerk smoke test → ${BASE}/s/${SLUG}/inventory\n`);

  // Health: suggest endpoint
  try {
    const s = await suggest("sol ring");
    if (s.count > 0) {
      pass("Autocomplete", `${s.count} suggestions; first: ${s.sample}`);
    } else {
      fail("Autocomplete", "No suggestions for 'sol ring'");
    }
  } catch (e) {
    fail("Autocomplete", e instanceof Error ? e.message : String(e));
  }

  // Inventory lookup
  try {
    const data = await clerk("Do you have Sol Ring in stock?");
    const picks = data.suggestedCards?.length ?? 0;
    const mode = data.classification?.mode;
    const source = data.classification?.answerSourceLabel;
    if (mode === "inventory_direct" && picks > 0) {
      pass(
        "Inventory (Sol Ring)",
        `mode=${mode} picks=${picks} source="${source}" reply="${(data.reply ?? "").slice(0, 120)}"`,
      );
    } else {
      fail(
        "Inventory (Sol Ring)",
        `mode=${mode} picks=${picks} reply="${data.reply ?? ""}"`,
      );
    }
  } catch (e) {
    fail("Inventory (Sol Ring)", e instanceof Error ? e.message : String(e));
  }

  // Knowledge / color pairing
  try {
    const data = await clerk("What colors are in Witch-maw Nebula?");
    const mode = data.classification?.mode;
    const status = data.verification?.status;
    const reply = (data.reply ?? "").toLowerCase();
    const mentionsColors =
      /\b(black|blue|green|white|red|ub|bg|color)\b/i.test(data.reply ?? "");
    if (mode === "knowledge" && mentionsColors && status !== "block") {
      pass(
        "Knowledge (Witch-maw)",
        `mode=${mode} verify=${status} reply="${(data.reply ?? "").slice(0, 150)}"`,
      );
    } else {
      fail(
        "Knowledge (Witch-maw)",
        `mode=${mode} verify=${status} reply="${data.reply ?? ""}" failures=${JSON.stringify(data.verification?.hard_failures)}`,
      );
    }
  } catch (e) {
    fail("Knowledge (Witch-maw)", e instanceof Error ? e.message : String(e));
  }

  // Price-sorted inventory
  try {
    const data = await clerk(
      "whats the highest price Lord of the Ring magic card you have?",
    );
    const picks = data.suggestedCards?.length ?? 0;
    const reply = data.reply ?? "";
    const mentionsPrice = /\$\d|price|expensive|highest/i.test(reply);
    if (picks > 0 && mentionsPrice) {
      pass(
        "Price sort (LOTR)",
        `picks=${picks} reply="${reply.slice(0, 150)}"`,
      );
    } else {
      fail(
        "Price sort (LOTR)",
        `picks=${picks} reply="${reply}"`,
      );
    }
  } catch (e) {
    fail("Price sort (LOTR)", e instanceof Error ? e.message : String(e));
  }

  // Follow-up after deck context — should NOT be deck build
  try {
    const history = [
      {
        role: "user" as const,
        text: "build me a commander deck under $100",
      },
      {
        role: "assistant" as const,
        text: "Built your Aesi list — 21/99 maindeck from stock ($152.00).",
      },
    ];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const res = await fetch(
      `${BASE}/api/store/${encodeURIComponent(SLUG)}/inventory/clerk`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:
            "whats the highest price Lord of the Ring magic card you have?",
          history,
          filters: {},
        }),
        signal: controller.signal,
      },
    );
    clearTimeout(timer);
    const data = (await res.json()) as ClerkResponse;
    const mode = data.classification?.mode;
    if (mode === "inventory_direct" && !data.deckList) {
      pass(
        "Post-deck inventory follow-up",
        `mode=${mode} (not deck_build) reply="${(data.reply ?? "").slice(0, 100)}"`,
      );
    } else {
      fail(
        "Post-deck inventory follow-up",
        `mode=${mode} unexpected routing`,
      );
    }
  } catch (e) {
    fail(
      "Post-deck inventory follow-up",
      e instanceof Error ? e.message : String(e),
    );
  }

  console.log(
    process.exitCode ? "\nSome checks FAILED" : "\nAll staging clerk checks PASSED",
  );
}

void main();
