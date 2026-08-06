"use client";

import { authContainer, authPage } from "@/lib/customer-auth-ui";

export function CustomerAuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={authPage}>
      <div className={authContainer}>{children}</div>
    </div>
  );
}
