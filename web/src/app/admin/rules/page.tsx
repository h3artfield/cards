import { redirect } from "next/navigation";

export default function AdminRulesRedirect() {
  redirect("/admin/pricing?section=rules");
}
