"use client";

import { authContainer, authPage } from "@/lib/customer-auth-ui";

export function CustomerAuthShell({
  children,
  /** The dashboard tab strip needs a little more width than sign-in forms. */
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={authPage}>
      <div
        className={`mx-auto flex min-h-screen flex-col px-6 py-10 ${
          wide ? "max-w-lg" : "max-w-md"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
