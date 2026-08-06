import { redirect } from "next/navigation";

export default async function AdminInventoryRedirect({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const params = await searchParams;
  if (params.section === "purchases") {
    redirect("/admin/reports?section=inventory&view=purchases");
  }
  redirect("/admin/reports?section=inventory");
}
