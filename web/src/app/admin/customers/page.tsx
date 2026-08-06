import { redirect } from "next/navigation";

export default function AdminCustomersRedirect() {
  redirect("/admin/reports?section=customers");
}
