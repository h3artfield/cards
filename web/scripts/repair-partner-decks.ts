/**
 * Moves a partner that an import left in the 99 into the deck's partner slot.
 * Dry run unless --apply. Scoped to one customer: --customer <id>.
 */
import { combinedGoldenOracleText } from "./lib/load-golden-catalog-index";
import { ensureFirebaseAdmin, requireFirestore } from "../src/lib/firebase/admin";
import { getDeckResolutionCatalogRuntime } from "../src/lib/deck-synthesis/professor-brew-catalog-runtime-v1";
import { commanderPairProblemV1 } from "../src/lib/professor-deck-editor/commander-pair-v1";
import type { EditableDeckV1 } from "../src/lib/professor-deck-editor/types-v1";

async function main() {
  const apply = process.argv.includes("--apply");
  const customerId = process.argv[process.argv.indexOf("--customer") + 1];
  if (!customerId || customerId.startsWith("--")) throw new Error("--customer <id> required");

  ensureFirebaseAdmin();
  const db = requireFirestore();
  const catalog = await getDeckResolutionCatalogRuntime();
  const pairCard = (oracleId: string | null) => {
    const card = oracleId ? catalog.byOracleId.get(oracleId) : undefined;
    return card ? { card, pair: { name: card.canonicalName, typeLine: card.typeLine ?? "", oracleText: combinedGoldenOracleText(card) } } : null;
  };

  const snap = await db.collection("customerEditableDecks").where("customerId", "==", customerId).get();
  for (const doc of snap.docs) {
    const deck = doc.data() as EditableDeckV1;
    if (deck.partner || deck.buildId) continue;
    const commander = pairCard(deck.commander.oracleId);
    if (!commander) continue;

    const candidates = deck.cards.filter((card) => {
      if (card.board !== "mainboard" || card.copies !== 1) return false;
      const other = pairCard(card.oracleId);
      return other != null && commanderPairProblemV1(commander.pair, other.pair) == null;
    });
    if (candidates.length !== 1) continue;

    const partnerCard = candidates[0]!;
    const partner = pairCard(partnerCard.oracleId)!.card;
    console.log(`${apply ? "REPAIR" : "would repair"} ${deck.deckId}: ${deck.commander.name} + ${partner.canonicalName}`);
    if (!apply) continue;

    await doc.ref.update({
      partner: {
        oracleId: partner.oracleId,
        name: partner.canonicalName,
        colorIdentity: [...(partner.colorIdentity ?? [])],
      },
      cards: deck.cards.filter((card) => card.cardKey !== partnerCard.cardKey),
      deckName:
        deck.deckName === deck.commander.name ? `${deck.commander.name} & ${partner.canonicalName}` : deck.deckName,
      revision: (deck.revision ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
