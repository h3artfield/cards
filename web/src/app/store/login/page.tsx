import { redirect } from "next/navigation";

/** Legacy store login URL — redirect to public /login */
export default function LegacyStoreLoginPage() {
  redirect("/login");
}
