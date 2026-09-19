"use client";

import { authContainer, authPage } from "@/lib/customer-auth-ui";

export function CustomerAuthShell({
  children,
  /** The dashboard tab strip needs a little more width than sign-in forms. */
  wide = false,
  /** Binder and card lists need room for faces and full names on desktop. */
  roomy = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
  roomy?: boolean;
}) {
  const width = roomy
    ? "w-full max-w-3xl py-10 sm:max-w-4xl sm:px-8 lg:max-w-6xl lg:px-10"
    : wide
      ? "max-w-lg py-12 sm:py-16"
      : "max-w-md py-10";

  return (
    <div className={authPage}>
      <div className={`mx-auto flex min-h-screen flex-col px-6 ${width}`}>
        {children}
      </div>
    </div>
  );
}
