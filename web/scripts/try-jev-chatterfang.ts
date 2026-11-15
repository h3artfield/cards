/**
 * One-shot Jev trial against the saved Chatterfang Bracket 3 Professor deck.
 * Needs TYPESAFE_API_KEY from console.typesafe.ai.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";

type Named = { name?: string; copies?: number };

function namesFrom(payload: {
  result?: {
    constructedDeck?: {
      commander?: { name?: string };
      lands?: Named[];
      nonlands?: Named[];
    };
    headProfessor?: Record<string, unknown>;
    userInputs?: { bracket?: number };
  };
}): { commander: string; cards: string[]; professor: Record<string, unknown> } {
  const deck = payload.result?.constructedDeck;
  if (!deck?.nonlands?.length) throw new Error("No constructed deck in fixture");
  const cards: string[] = [];
  for (const row of [...(deck.nonlands ?? []), ...(deck.lands ?? [])]) {
    const name = row.name?.trim();
    if (!name) continue;
    const copies = Math.max(1, Math.floor(row.copies ?? 1));
    for (let i = 0; i < copies; i++) cards.push(name);
  }
  return {
    commander: deck.commander?.name ?? "Unknown",
    cards,
    professor: {
      requestedBracket: payload.result?.userInputs?.bracket,
      grade: payload.result?.headProfessor?.grade,
      classification: payload.result?.headProfessor?.classification,
      bracketFit: payload.result?.headProfessor?.bracketFit,
      offPlanCards: payload.result?.headProfessor?.offPlanCards,
      optionalChanges: payload.result?.headProfessor?.optionalChanges,
    },
  };
}

async function main() {
  const fixture = JSON.parse(
    readFileSync(
      path.join(process.cwd(), ".sol-directed-gui-test-result-chatterfang.json"),
      "utf8",
    ),
  );
  const { commander, cards, professor } = namesFrom(fixture);
  const key = process.env.TYPESAFE_API_KEY?.trim();
  console.log(
    JSON.stringify(
      {
        commander,
        cardCount: cards.length,
        professor,
        hasKey: Boolean(key),
      },
      null,
      2,
    ),
  );

  if (!key) {
    console.error(
      "Missing TYPESAFE_API_KEY. Create one at https://console.typesafe.ai and rerun.",
    );
    process.exit(2);
  }

  const body = {
    model: MODEL,
    state: {
      format: "Commander",
      commander,
      requestedBracket: 3,
      playstyle: "tokens and sacrifice value",
      librarySize: cards.length,
      decklist: cards,
    },
    questions: {
      bracket: {
        type: "choice",
        instructions:
          "Which official Commander bracket does this 99 actually play as, not the requested target?",
        criteria: {
          "1": "Exhibition: preconstructed-like, very low power",
          "2": "Core: casual, no game changers, no early combo",
          "3": "Upgraded: synergistic value, telegraphed wins, limited tutors/fast mana",
          "4": "Optimized: high power, efficient interaction, compact wins",
          "5": "Cedh: tournament-optimized, fastest wins and interaction",
        },
      },
      mana: {
        type: "score",
        instructions:
          "How well does the mana base and ramp support casting the commander on time and paying later activations?",
        criteria: [
          "Unreliable colors or too little ramp",
          "Playable but awkward",
          "Solid and consistent",
          "Excellent; rarely misses early commander or colors",
        ],
      },
      interaction: {
        type: "score",
        instructions:
          "How complete is the interaction suite for a Bracket 3 table (creatures, artifacts, enchantments, graveyard, a reset)?",
        criteria: [
          "Large holes; missing whole categories",
          "Thin but some answers",
          "Broad enough for Bracket 3",
          "Dense and well-spread without starving the plan",
        ],
      },
      wincons: {
        type: "score",
        instructions:
          "How convincing are the win paths (combat overrun and finite aristocrats) without hidden infinite combo?",
        criteria: [
          "No real closer",
          "One fragile line",
          "Two interactable lines that match the commander",
          "Redundant, telegraphed, table-ending lines",
        ],
      },
      commander_fit: {
        type: "score",
        instructions:
          "How well does this 99 exploit Chatterfang's token-doubling and squirrel-sacrifice identity?",
        criteria: [
          "Generic Golgari; commander is optional",
          "Some token synergy",
          "Built around Chatterfang without being a combo shell",
          "Every package leans on the commander and still functions if he dies",
        ],
      },
      is_requested_bracket: {
        type: "noul",
        instructions:
          "This list is a fair Bracket 3 Chatterfang tokens/sacrifice deck, not secretly Bracket 4 combo.",
      },
      first_cut: {
        type: "choice",
        instructions:
          "If you must cut one card to tighten the deck, which of these flex slots goes first?",
        criteria: {
          "Dreadhorde Invasion":
            "Conditional token engine; later amass often adds counters, not new tokens",
          "Lolth, Spider Queen": "Useful value, weaker repeatable tokens than dedicated engines",
          "Deadly Tempest": "Reset that can punish this deck's own wide board",
          "Camellia, the Seedmiser": "Nice Squirrel payoff, not structural",
          "Return of the Wildspeaker": "Flexible pump or draw; defensible closer",
          none: "Do not cut any of these; the list is already tight",
        },
      },
    },
  };

  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep raw text
  }
  console.log(
    JSON.stringify(
      {
        httpStatus: res.status,
        latencyMs: Date.now() - started,
        response: parsed,
      },
      null,
      2,
    ),
  );
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
