/** Firestore rejects `undefined` field values — strip them before writes. */
export function forFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
