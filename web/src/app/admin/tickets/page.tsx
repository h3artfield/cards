"use client";

import { AdminLayout } from "@/components/AdminLayout";
import { ShopTicketRegister } from "@/components/admin/ShopTicketRegister";

export default function AdminTicketsPage() {
  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-xl font-semibold text-slate-900">Register</h1>
        <p className="mt-1 text-sm text-slate-500">
          In-store sales and trade credit.
        </p>
        <div className="mt-6">
          <ShopTicketRegister />
        </div>
      </div>
    </AdminLayout>
  );
}
