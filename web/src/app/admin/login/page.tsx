"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminLoginForm } from "@/components/AdminLoginForm";

export default function AdminLoginPage() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/admin/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (data.session?.role === "platform") {
          router.replace("/admin/stores");
        }
      })
      .catch(() => {});
  }, [router]);

  return (
    <AdminLoginForm
      expectedRole="platform"
      title="Platform admin"
      subtitle="Manage all stores, create new locations, and view cross-store reports."
      redirectTo="/admin/stores"
    />
  );
}
