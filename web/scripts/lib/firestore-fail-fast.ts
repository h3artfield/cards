import {
  LOCAL_FIRESTORE_FAIL_FAST_HINT,
  LOCAL_FIRESTORE_TIMEOUT_MS,
} from "./script-env";

export class FirestoreScriptTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(
      `${label} timed out after ${ms / 1000}s. ${LOCAL_FIRESTORE_FAIL_FAST_HINT}`,
    );
    this.name = "FirestoreScriptTimeoutError";
  }
}

/** Fail fast for local scripts — never hang for minutes on Firestore. */
export async function withFirestoreScriptTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  ms = LOCAL_FIRESTORE_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new FirestoreScriptTimeoutError(label, ms)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function requireLocalFirestore<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withFirestoreScriptTimeout(label, fn);
}
