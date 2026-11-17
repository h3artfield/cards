"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/api-client";
import {
  CHAT_MESSAGE_MAX_CHARS,
  CONFIRM_QUERY,
  historyFor,
  readAgentReply,
  relockItems,
  type ChatConfirm,
  type ChatItem,
} from "@/lib/shop-assistant/chat-client";
import { readShopReply } from "@/lib/shop-assistant/detect";

export type ShopChat = {
  /** False until the server says the assistant is switched on for this person. */
  enabled: boolean;
  items: ChatItem[];
  busy: boolean;
  send: (text: string) => void;
  /** Opens a customer list the assistant offered, after the person asks for it. */
  confirm: (itemId: number, tool: string) => void;
  /** Hides every opened customer list again. */
  relock: () => void;
  reset: () => void;
};

/** The conversation with the store assistant. It lives in memory only. */
export function useShopChat(): ShopChat {
  const [enabled, setEnabled] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const itemsRef = useRef<ChatItem[]>([]);
  const nextId = useRef(1);
  const request = useRef<AbortController | null>(null);

  const update = useCallback((change: (current: ChatItem[]) => ChatItem[]) => {
    itemsRef.current = change(itemsRef.current);
    setItems(itemsRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    adminFetch("/api/admin/shop-assistant/chat")
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { enabled?: unknown } | null;
        if (!cancelled) setEnabled(res.ok && data?.enabled === true);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
      request.current?.abort();
    };
  }, []);

  const send = useCallback(
    (raw: string) => {
      const text = raw.replace(/\s+/g, " ").trim().slice(0, CHAT_MESSAGE_MAX_CHARS);
      if (!text || request.current) return;
      const history = historyFor(itemsRef.current);
      update((current) => [...current, { id: nextId.current++, kind: "user", text }]);
      const controller = new AbortController();
      request.current = controller;
      setBusy(true);
      adminFetch("/api/admin/shop-assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, history }),
        signal: controller.signal,
      })
        .then(async (res) => {
          const data: unknown = await res.json().catch(() => null);
          if (controller.signal.aborted) return;
          const reply = readAgentReply(res.ok, data);
          update((current) => [
            ...current,
            reply.kind === "reply"
              ? {
                  id: nextId.current++,
                  kind: "assistant",
                  text: reply.text,
                  caution: reply.caution,
                  panels: reply.panels,
                  confirms: reply.confirms.map((tool): ChatConfirm => ({ tool, state: "locked" })),
                }
              : { id: nextId.current++, kind: "error", text: reply.message },
          ]);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          update((current) => [
            ...current,
            { id: nextId.current++, kind: "error", text: "Couldn't reach the assistant. Try again in a moment." },
          ]);
        })
        .finally(() => {
          if (request.current === controller) {
            request.current = null;
            setBusy(false);
          }
        });
    },
    [update],
  );

  const setConfirm = useCallback(
    (itemId: number, tool: string, next: ChatConfirm) => {
      update((current) =>
        current.map((item) =>
          item.id === itemId && item.kind === "assistant"
            ? { ...item, confirms: item.confirms.map((c) => (c.tool === tool ? next : c)) }
            : item,
        ),
      );
    },
    [update],
  );

  const confirm = useCallback(
    (itemId: number, tool: string) => {
      setConfirm(itemId, tool, { tool, state: "loading" });
      // The same route, and the same checks, as the search box's confirm step.
      adminFetch("/api/admin/shop-assistant", {
        method: "POST",
        body: JSON.stringify({ query: CONFIRM_QUERY, confirm: true, tool }),
      })
        .then(async (res) => {
          const data: unknown = await res.json().catch(() => null);
          const reply = readShopReply(res.ok, res.status, data);
          setConfirm(
            itemId,
            tool,
            reply.kind === "answer" && reply.tool === tool
              ? { tool, state: "shown", answer: reply.answer }
              : {
                  tool,
                  state: "failed",
                  message: reply.kind === "error" ? reply.message : "Couldn't open that just now.",
                },
          );
        })
        .catch(() => setConfirm(itemId, tool, { tool, state: "failed", message: "Couldn't open that just now." }));
    },
    [setConfirm],
  );

  const relock = useCallback(() => update(relockItems), [update]);

  const reset = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    update(() => []);
  }, [update]);

  return { enabled, items, busy, send, confirm, relock, reset };
}
