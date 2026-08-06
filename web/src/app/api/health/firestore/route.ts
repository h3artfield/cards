import { dataStore, getStorageMode } from "@/lib/storage/data-store";
import { isCloudDeployment } from "@/lib/cloud-env";
import {
  ensureFirebaseAdmin,
  FirestoreUnavailableError,
  getServiceAccountKeyIssue,
} from "@/lib/firebase/admin";
import { COLLECTIONS, STORE_SETTINGS_DOC } from "@/lib/firebase/collections";
import { jsonOk, jsonError } from "@/lib/api-utils";

export async function GET() {
  const admin = ensureFirebaseAdmin();

  if (!admin.configured) {
    const keyIssue = getServiceAccountKeyIssue();
    const message =
      keyIssue ??
      "Firebase Admin not configured — using in-memory storage. Add FIREBASE_SERVICE_ACCOUNT_KEY to web/.env.local.";
    if (isCloudDeployment()) {
      return jsonError(
        `${message} In-memory fallback is disabled in cloud deployments.`,
        503,
      );
    }
    return jsonOk({
      ok: false,
      storageMode: "memory",
      cloudDeployment: false,
      message,
      firestore: { reachable: false },
      env: { loadedFrom: "web/.env.local (Next.js)" },
    });
  }

  if (!admin.initialized) {
    console.warn("[firestore health]", admin.error);
    return jsonError(
      admin.error ??
        "Firebase Admin failed to initialize. Check FIREBASE_SERVICE_ACCOUNT_KEY.",
      503,
    );
  }

  try {
    const settings = await dataStore.getSettings();
    const rules = await dataStore.getActiveRules();

    const db = await import("@/lib/firebase/admin").then((m) =>
      m.getAdminFirestore(),
    );
    const settingsSnap = db
      ? await db
          .collection(COLLECTIONS.storeSettings)
          .doc(STORE_SETTINGS_DOC)
          .get()
      : null;

    return jsonOk({
      ok: true,
      storageMode: getStorageMode(),
      cloudDeployment: isCloudDeployment(),
      requireFirestore: process.env.REQUIRE_FIRESTORE === "true",
      projectId: admin.projectId,
      firestore: {
        reachable: true,
        storeSettingsExists: settingsSnap?.exists ?? false,
        storeSettingsDoc: `${COLLECTIONS.storeSettings}/${STORE_SETTINGS_DOC}`,
      },
      storeSettings: {
        storeName: settings.storeName,
        ownerEmail: settings.ownerEmail,
        defaultCashPercent: settings.defaultCashPercent,
        defaultTradePercent: settings.defaultTradePercent,
        manualReviewThreshold: settings.manualReviewThreshold,
        emailNotificationsEnabled: settings.emailNotificationsEnabled,
      },
      activeStoreRulesCount: rules.length,
      env: { loadedFrom: "web/.env.local (Next.js)" },
    });
  } catch (err) {
    const message =
      err instanceof FirestoreUnavailableError
        ? err.message
        : err instanceof Error
          ? `Firestore read failed: ${err.message}`
          : "Firestore read failed";

    console.warn("[firestore health]", message);
    return jsonError(message, 503);
  }
}
