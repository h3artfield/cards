import { redirect } from "next/navigation";

export default function AdminConditionsRedirect() {
  redirect("/admin/pricing?section=conditions");
}
