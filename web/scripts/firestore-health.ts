/**
 * Directive 006P — local Firestore health (fail-fast, max ~15s).
 * Run: npm run firestore:health
 */
import { loadEnvLocal, LOCAL_FIRESTORE_TIMEOUT_MS } from "./lib/script-env";
import { withFirestoreScriptTimeout } from "./lib/firestore-fail-fast";
import { isCloudDeployment } from "../src/lib/cloud-env";

loadEnvLocal();

function credentialSource(): string {
  if (process.env.FIRESTORE_EMULATOR_HOST?.trim()) {
    return `emulator (${process.env.FIRESTORE_EMULATOR_HOST})`;
  }
  if (isCloudDeployment()) {
    return "applicationDefault (Cloud Run service account)";
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return `GOOGLE_APPLICATION_CREDENTIALS (${process.env.GOOGLE_APPLICATION_CREDENTIALS})`;
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()) {
    return "FIREBASE_SERVICE_ACCOUNT_KEY (web/.env.local)";
  }
  return "none — not configured";
}

function suggestedFix(input: {
  initOk: boolean;
  readOk: boolean;
  initError?: string | null;
  readError?: string;
}): string {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return "FIRESTORE_EMULATOR_HOST is set — ensure the emulator is running or unset it to use cloud Firestore.";
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim() && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return "Set FIREBASE_SERVICE_ACCOUNT_KEY in web/.env.local (base64 service account JSON). For staging card work, use admin Re-run V2 shadow analysis instead of local scripts.";
  }
  if (!input.initOk) {
    return input.initError
      ? `Fix Firebase Admin init: ${input.initError}`
      : "Firebase Admin failed to initialize — verify service account key format.";
  }
  if (!input.readOk) {
    return (
      input.readError ??
      "Firestore read timed out or failed. Check network/VPN/firewall. Use staging admin v2-reprocess for card lookup until local access works."
    );
  }
  return "Local Firestore looks healthy.";
}

async function main() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    "(unset)";

  console.log("Firestore health check\n");
  console.log(`project ID: ${projectId}`);
  console.log(`credential source: ${credentialSource()}`);
  console.log(
    `FIRESTORE_EMULATOR_HOST: ${process.env.FIRESTORE_EMULATOR_HOST ?? "(unset)"}`,
  );

  const { ensureFirebaseAdmin, requireFirestore } = await import(
    "../src/lib/firebase/admin"
  );
  const { COLLECTIONS, STORE_SETTINGS_DOC } = await import(
    "../src/lib/firebase/collections"
  );

  const adminStatus = ensureFirebaseAdmin();
  console.log(
    `Firebase Admin init: ${adminStatus.initialized ? "ok" : "failed"}${
      adminStatus.error ? ` — ${adminStatus.error}` : ""
    }`,
  );

  let readOk = false;
  let readError: string | undefined;

  if (adminStatus.initialized) {
    try {
      await withFirestoreScriptTimeout("Firestore read (storeSettings/default)", async () => {
        const db = requireFirestore();
        const snap = await db
          .collection(COLLECTIONS.storeSettings)
          .doc(STORE_SETTINGS_DOC)
          .get();
        if (!snap.exists) {
          throw new Error("storeSettings/default document not found");
        }
        readOk = true;
      }, LOCAL_FIRESTORE_TIMEOUT_MS);
      console.log("simple read: ok (storeSettings/default)");
    } catch (err) {
      readError = err instanceof Error ? err.message : String(err);
      console.log(`simple read: failed — ${readError}`);
    }
  } else {
    console.log("simple read: skipped (Admin not initialized)");
  }

  const fix = suggestedFix({
    initOk: adminStatus.initialized,
    readOk,
    initError: adminStatus.error,
    readError,
  });
  console.log(`\nsuggested fix: ${fix}`);

  if (!adminStatus.initialized || !readOk) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
