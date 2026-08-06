import { redirect } from "next/navigation";

export default function AdminProvidersRedirect() {
  redirect("/admin/pricing?section=providers");
}
