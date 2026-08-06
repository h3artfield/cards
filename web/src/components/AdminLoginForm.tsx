"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import {
  displayAuthHeaders,
  saveDisplayToken,
  showPathWithDisplayToken,
} from "@/lib/display-auth";
import type { AdminRole } from "@/lib/types";

export function AdminLoginForm({
  expectedRole,
  title,
  subtitle,
  redirectTo,
  compact = false,
  allowInactiveSubscription = false,
  hardRedirect = false,
  defaultEmail = "",
  defaultPassword = "",
  autoLogin = false,
  useDisplayToken = false,
}: {
  expectedRole: AdminRole;
  title: string;
  subtitle: string;
  redirectTo: string;
  compact?: boolean;
  /** When true, skip billing redirect (e.g. in-store display TVs). */
  allowInactiveSubscription?: boolean;
  /** Full page navigation — helps TV browsers pick up Set-Cookie after login. */
  hardRedirect?: boolean;
  defaultEmail?: string;
  defaultPassword?: string;
  /** Sign in immediately using defaultEmail/defaultPassword (e.g. TV bookmark). */
  autoLogin?: boolean;
  /** Persist session token for TVs that ignore HttpOnly cookies. */
  useDisplayToken?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const autoLoginStarted = useRef(false);

  const performLogin = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, expectedRole }),
        });
        const data = (await res.json()) as {
          error?: string;
          token?: string;
          session?: { role?: string };
        };
        if (!res.ok) {
          setError(data.error ?? "Login failed");
          return;
        }

        const sessionToken =
          typeof data.token === "string" ? data.token.trim() : "";
        if (useDisplayToken && sessionToken) {
          saveDisplayToken(sessionToken);
        }

        const go = (dest: string) => {
          const target =
            useDisplayToken && sessionToken
              ? showPathWithDisplayToken(dest, sessionToken)
              : dest;
          if (hardRedirect) {
            window.location.assign(target);
            return;
          }
          router.replace(target);
          router.refresh();
        };

        if (expectedRole === "store") {
          const authHeaders = useDisplayToken
            ? displayAuthHeaders()
            : undefined;
          const me = await fetch("/api/admin/me", {
            credentials: "include",
            headers: authHeaders,
          });
          if (me.ok) {
            const meData = await me.json();
            go(
              meData.subscriptionActive || allowInactiveSubscription
                ? redirectTo
                : "/billing",
            );
            return;
          }
          if (useDisplayToken && sessionToken && allowInactiveSubscription) {
            go(redirectTo);
            return;
          }
          setError(
            "Signed in but the session did not stick. Try again or refresh the page.",
          );
          return;
        }

        go(redirectTo);
      } catch {
        setError("Network error — try again.");
      } finally {
        setLoading(false);
      }
    },
    [
      allowInactiveSubscription,
      expectedRole,
      hardRedirect,
      redirectTo,
      router,
      useDisplayToken,
    ],
  );

  useEffect(() => {
    if (!autoLogin || !defaultEmail.trim() || !defaultPassword || autoLoginStarted.current) {
      return;
    }
    autoLoginStarted.current = true;
    void performLogin(defaultEmail.trim(), defaultPassword);
  }, [autoLogin, defaultEmail, defaultPassword, performLogin]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    await performLogin(email, password);
  }

  return (
    <div className={compact ? "" : "mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6"}>
      {title ? <h1 className="text-2xl font-bold">{title}</h1> : null}
      {subtitle ? <p className="mt-2 text-sm text-gray-600">{subtitle}</p> : null}
      <form
        method="post"
        action="#"
        onSubmit={(e) => void handleSubmit(e)}
        className={compact ? "space-y-4" : "mt-6 space-y-4"}
      >
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            disabled={loading}
            defaultValue={defaultEmail}
            className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={loading}
            defaultValue={defaultPassword}
            className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 disabled:bg-gray-100"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" fullWidth disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
