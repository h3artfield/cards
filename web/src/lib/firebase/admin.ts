import { initializeApp, getApps, cert, App, applicationDefault } from "firebase-admin/app";
import {
  getFirestore,
  initializeFirestore,
  type Firestore,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { isCloudDeployment } from "../cloud-env";

let adminApp: App | null = null;
let cachedFirestore: Firestore | null = null;
let initAttempted = false;
let initError: string | null = null;

export interface FirebaseAdminStatus {
  configured: boolean;
  initialized: boolean;
  projectId: string | null;
  error: string | null;
  storageMode: "firestore" | "memory";
}

export function getProjectId(): string | undefined {
  return (
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

export function isAdminConfigured(): boolean {
  if (isCloudDeployment() && getProjectId()) {
    return true;
  }
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  return Boolean(
    getProjectId() && (key || process.env.GOOGLE_APPLICATION_CREDENTIALS),
  );
}

export function getServiceAccountKeyIssue(): string | null {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return null;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw === undefined) {
    return "FIREBASE_SERVICE_ACCOUNT_KEY is missing from web/.env.local.";
  }
  if (!raw.trim()) {
    return "FIREBASE_SERVICE_ACCOUNT_KEY is empty in web/.env.local. Paste your base64-encoded service account JSON after the = sign.";
  }
  return null;
}

function safeInitErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("private_key") || msg.includes("BEGIN PRIVATE KEY")) {
      return "Firebase Admin credential rejected: invalid service account key format.";
    }
    return `Firebase Admin initialization failed: ${msg}`;
  }
  return "Firebase Admin initialization failed with an unknown error.";
}

/** Decode plain JSON or base64-encoded service account JSON. Never logs secrets. */
export function parseServiceAccountKey(): Record<string, unknown> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) return null;

  let jsonText = raw;

  if (!raw.startsWith("{")) {
    try {
      jsonText = Buffer.from(raw, "base64").toString("utf8");
    } catch {
      initError =
        "FIREBASE_SERVICE_ACCOUNT_KEY is not valid base64. Encode your service account JSON file with base64, or paste the raw JSON.";
      return null;
    }
  }

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    if (typeof parsed.client_email !== "string" || !parsed.private_key) {
      initError =
        "Decoded service account JSON is missing client_email or private_key.";
      return null;
    }
    return parsed;
  } catch {
    initError =
      "FIREBASE_SERVICE_ACCOUNT_KEY could not be parsed as JSON (after base64 decode if applicable).";
    return null;
  }
}

function initializeAdminApp(): App | null {
  if (adminApp) return adminApp;

  const existing = getApps();
  if (existing.length) {
    adminApp = existing[0]!;
    initError = null;
    return adminApp;
  }

  const projectId = getProjectId();
  const storageBucket =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    (projectId ? `${projectId}.appspot.com` : undefined);

  if (isCloudDeployment() && projectId && !process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()) {
    try {
      adminApp = initializeApp({
        credential: applicationDefault(),
        projectId,
        storageBucket,
      });
      initError = null;
      return adminApp;
    } catch (err) {
      initError = safeInitErrorMessage(err);
      return null;
    }
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      adminApp = initializeApp({
        projectId: getProjectId(),
        storageBucket:
          process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
          `${getProjectId()}.appspot.com`,
      });
      initError = null;
      return adminApp;
    } catch (err) {
      initError = safeInitErrorMessage(err);
      return null;
    }
  }

  const serviceAccount = parseServiceAccountKey();
  if (!serviceAccount) {
    if (!initError) {
      initError = "FIREBASE_SERVICE_ACCOUNT_KEY is missing or empty.";
    }
    return null;
  }

  try {
    adminApp = initializeApp({
      credential: cert(serviceAccount as Parameters<typeof cert>[0]),
      projectId: getProjectId() ?? String(serviceAccount.project_id ?? ""),
      storageBucket:
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
        `${getProjectId() ?? serviceAccount.project_id}.appspot.com`,
    });
    initError = null;
    return adminApp;
  } catch (err) {
    initError = safeInitErrorMessage(err);
    adminApp = null;
    return null;
  }
}

/** Eagerly attempt Admin init; safe to call on every health check. */
export function ensureFirebaseAdmin(): FirebaseAdminStatus {
  initAttempted = true;

  if (!isAdminConfigured()) {
    return {
      configured: false,
      initialized: false,
      projectId: getProjectId() ?? null,
      error: null,
      storageMode: "memory",
    };
  }

  const app = initializeAdminApp();
  return {
    configured: true,
    initialized: app != null,
    projectId: getProjectId() ?? null,
    error: initError,
    storageMode: app != null ? "firestore" : "memory",
  };
}

export function getFirebaseAdminStatus(): FirebaseAdminStatus {
  if (!initAttempted) return ensureFirebaseAdmin();
  return {
    configured: isAdminConfigured(),
    initialized: adminApp != null,
    projectId: getProjectId() ?? null,
    error: initError,
    storageMode:
      isAdminConfigured() && adminApp != null ? "firestore" : "memory",
  };
}

export function getAdminApp(): App | null {
  if (!isAdminConfigured()) return null;
  return initializeAdminApp();
}

let firestoreSettingsApplied = false;

function applyFirestoreSettings(db: Firestore): Firestore {
  if (!firestoreSettingsApplied) {
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (!message.includes("already been initialized")) {
        throw err;
      }
    }
    firestoreSettingsApplied = true;
  }
  return db;
}

export function getAdminFirestore(): Firestore | null {
  const app = getAdminApp();
  if (!app) return null;
  if (cachedFirestore) return cachedFirestore;

  try {
    cachedFirestore = initializeFirestore(app, { ignoreUndefinedProperties: true });
    firestoreSettingsApplied = true;
    return cachedFirestore;
  } catch {
    cachedFirestore = applyFirestoreSettings(getFirestore(app));
    return cachedFirestore;
  }
}

export function getAdminStorage() {
  const app = getAdminApp();
  return app ? getStorage(app) : null;
}

export class FirestoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirestoreUnavailableError";
  }
}

/** Returns Firestore when configured; throws with a safe message if init failed. */
export function requireFirestore(): Firestore {
  if (!isAdminConfigured()) {
    throw new FirestoreUnavailableError(
      "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY in web/.env.local to use Firestore.",
    );
  }

  const db = getAdminFirestore();
  if (!db) {
    const status = getFirebaseAdminStatus();
    throw new FirestoreUnavailableError(
      status.error ??
        "Firebase Admin failed to initialize. Check FIREBASE_SERVICE_ACCOUNT_KEY in web/.env.local.",
    );
  }

  return db;
}
