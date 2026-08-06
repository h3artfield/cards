export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
  } catch {
    throw new Error(
      "Network error — check that your phone is on the same Wi‑Fi as this computer.",
    );
  }

  let data: { error?: string } & T;
  try {
    data = await res.json();
  } catch {
    throw new Error(
      res.ok
        ? "Invalid server response"
        : `Request failed (${res.status}). Restart the dev server and try again.`,
    );
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export function getAdminKey(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("adminKey");
}

export function setAdminKey(key: string): void {
  sessionStorage.setItem("adminKey", key);
}

export function adminHeaders(): HeadersInit {
  const key = getAdminKey();
  return key ? { "x-admin-key": key } : {};
}

/** Admin API calls — session cookie auth */
export function adminFetch(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  return fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
}
