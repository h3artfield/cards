import { useEffect, useRef } from "react";

/** Poll while the browser tab is visible; pauses when hidden. */
export function usePollingWhenVisible(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    function tick() {
      void callbackRef.current();
    }

    function start() {
      if (timer || document.hidden) return;
      timer = setInterval(tick, intervalMs);
    }

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
