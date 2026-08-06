/**
 * P0 staging traces — entity resolution, theme routing, preview theorycraft.
 * Run: npx tsx scripts/smoke-staging-p0-clerk.ts
 */
const BASE =
  process.env.STAGING_URL ??
  "https://buyback-web-staging-rrogeqxyea-uc.a.run.app";
const SLUG = "the-game-lodge";

async function clerk(message: string) {
  const started = Date.now();
  const res = await fetch(
    `${BASE}/api/store/${encodeURIComponent(SLUG)}/inventory/clerk`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: [], filters: {} }),
    },
  );
  const data = (await res.json()) as Record<string, unknown>;
  return { data, ms: Date.now() - started, ok: res.ok };
}

let failed = 0;

function logTrace(label: string, data: Record<string, unknown>, ms: number) {
  const verify = data.verification as { status?: string } | undefined;
  const deck = data.deckList as
    | {
        commanderOracleId?: string;
        commanderCanonicalName?: string;
        archetype?: string;
      }
    | undefined;
  console.log(`${label} (${ms}ms)`);
  console.log(`  verify: ${verify?.status ?? "n/a"}`);
  console.log(`  reply: ${String(data.reply ?? "").slice(0, 220).replace(/\n/g, " ")}`);
  if (deck?.commanderOracleId) {
    console.log(`  commanderOracleId: ${deck.commanderOracleId}`);
  }
  if (deck?.commanderCanonicalName ?? deck?.archetype) {
    console.log(
      `  commander: ${deck.commanderCanonicalName ?? deck.archetype}`,
    );
  }
}

async function main() {
  const cases = [
    {
      label: "A: Smaug the Magnificent preview theorycraft",
      message:
        "Build a complete Commander deck around Smaug the Magnificent, the newly previewed card from the upcoming Hobbit set.",
      expect: (d: Record<string, unknown>) => {
        const reply = String(d.reply ?? "").toLowerCase();
        const deck = d.deckList as { commanderOracleId?: string } | undefined;
        return (
          (reply.includes("smaug the magnificent") ||
            reply.includes("preview") ||
            reply.includes("theorycraft")) &&
          (Boolean(deck?.commanderOracleId) || reply.includes("which one"))
        );
      },
    },
    {
      label: "B: nonexistent commander blocked",
      message:
        "build a complete commander deck around Zzzzznonexistent Commander XYZ123",
      expect: (d: Record<string, unknown>) => {
        const reply = String(d.reply ?? "").toLowerCase();
        return (
          reply.includes("couldn't identify") ||
          reply.includes("couldn't canonically verify") ||
          reply.includes("exact card name")
        );
      },
    },
    {
      label: "C: bird-themed deck offers commander choices",
      message: "build me a bird themed commander deck",
      expect: (d: Record<string, unknown>) => {
        const reply = String(d.reply ?? "").toLowerCase();
        return (
          (reply.includes("commander") && reply.includes("pick")) ||
          reply.includes("options")
        );
      },
    },
    {
      label: "D: mono-blue inventory filter",
      message: "mono-blue commanders in stock",
      expect: (d: Record<string, unknown>) => Boolean(d.reply),
    },
  ];

  for (const c of cases) {
    const { data, ms, ok } = await clerk(c.message);
    const pass = ok && c.expect(data);
    console.log(`${pass ? "✓" : "✗"} ${c.label}`);
    logTrace("  trace", data, ms);
    if (!pass) failed += 1;
  }

  if (failed > 0) {
    console.error(`\n${failed} P0 staging check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nP0 staging traces PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
