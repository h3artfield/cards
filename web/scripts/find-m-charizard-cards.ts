import { readFileSync } from "fs";
import { resolve } from "path";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { requireFirestore } from "../src/lib/firebase/admin";

function loadEnvLocal() {
  const p = resolve(__dirname, "../.env.local");
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] == null) {
      process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}

async function main() {
  loadEnvLocal();
  process.env.REQUIRE_FIRESTORE = "true";
  const db = requireFirestore();

  const snap = await db
    .collection(COLLECTIONS.cards)
    .where("detectedName", ">=", "M Charizard")
    .where("detectedName", "<=", "M Charizard\uf8ff")
    .limit(20)
    .get();

  console.log(`Found ${snap.size} card(s) matching "M Charizard*"\n`);
  for (const d of snap.docs) {
    const c = d.data();
    const id = c.cardFlowV2Identity;
    console.log(
      JSON.stringify(
        {
          id: d.id,
          name: c.detectedName,
          set: c.setName,
          num: c.cardNumber,
          orderId: c.orderId,
          suspects: id?.suspects?.length ?? 0,
          notes: id?.candidateGenerationNotes?.slice(0, 2),
          locked: id?.lockedIdentity?.lockStatus,
          warnings: c.warnings?.slice(0, 2),
        },
        null,
        2,
      ),
    );
    console.log("---");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
