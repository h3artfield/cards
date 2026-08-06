import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim();
  }
}

async function main() {
  loadEnv();
  process.env.REQUIRE_FIRESTORE = "true";
  const { getAdminFirestore } = await import("../src/lib/firebase/admin");
  const db = getAdminFirestore();
  const storeId = process.argv[2] ?? "083e21ff-c7d6-46e5-b079-93416f01f41b";
  const snap = await db.collection("stores").doc(storeId).get();
  const data = snap.data();
  console.log(
    JSON.stringify(
      {
        exists: snap.exists,
        subscription: data?.subscription ?? null,
        ownerEmail: data?.ownerEmail ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch(console.error);
