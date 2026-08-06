import { extractCardPhraseFromFactQuestion } from "../src/lib/store-inventory/simple-clerk/simple-clerk-intent";
import { answerCardFactQuestion } from "../src/lib/store-inventory/simple-clerk/simple-card-fact";
import { SIMPLE_CLERK_EVAL_CASES } from "./simple-clerk-evaluation-cases";

async function main() {
  console.log("Total eval cases:", SIMPLE_CLERK_EVAL_CASES.length);

  for (const q of [
    "Is Lórien Revealed a commander?",
    "Is Embrace the Unknown a commander?",
    "What type of card is Sol Ring?",
  ]) {
    const fact = extractCardPhraseFromFactQuestion(q);
    console.log("\nQ:", q);
    console.log("Phrase:", fact?.cardPhrase);
    if (!fact) continue;
    const answer = await answerCardFactQuestion({
      question: q,
      kind: fact.kind,
      cardPhrase: fact.cardPhrase,
    });
    if (answer && !("ambiguous" in answer)) {
      console.log("A:", answer.directAnswer);
      console.log("Oracle:", answer.oracleId);
    } else {
      console.log("A: unresolved", answer);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

main().catch(console.error);
