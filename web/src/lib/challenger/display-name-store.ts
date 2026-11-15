import { COLLECTIONS } from "../firebase/collections";
import { getAdminFirestore } from "../firebase/admin";

export async function challengerDisplayNameTaken(
  key: string,
  exceptCustomerId?: string,
): Promise<boolean> {
  const db = getAdminFirestore();
  if (!db) return false;
  const snap = await db
    .collection(COLLECTIONS.customers)
    .where("challengerDisplayNameKey", "==", key)
    .limit(3)
    .get();
  return snap.docs.some((doc) => doc.id !== exceptCustomerId);
}
