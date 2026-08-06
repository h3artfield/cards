import { redirect } from "next/navigation";

export default function AdminPurchasesRedirect() {
  redirect("/admin/reports?section=inventory&view=purchases");
}
