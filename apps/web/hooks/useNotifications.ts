import { useState, useCallback, useEffect, useRef } from "react";

const ORIGINAL_TITLE = "Vortex - Real-time Chat";

export function playNeoChime(isMention = false) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isMention ? "triangle" : "sine";
    const now = ctx.currentTime;
    if (isMention) {
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.1); // A5
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      osc.frequency.setValueAtTime(659.25, now); // E5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch {
    // AudioContext may be restricted by autoplay policy until user interaction
  }
}

export function useNotifications() {
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");
  const unreadCountRef = useRef(0);
  const titleIntervalRef = useRef<number | null>(null);

  const clearTitleFlash = useCallback(() => {
    unreadCountRef.current = 0;
    if (titleIntervalRef.current) {
      clearInterval(titleIntervalRef.current);
      titleIntervalRef.current = null;
    }
    if (typeof document !== "undefined") {
      document.title = ORIGINAL_TITLE;
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
    const onVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        clearTitleFlash();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onVisibilityOrFocus);
      document.addEventListener("visibilitychange", onVisibilityOrFocus);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onVisibilityOrFocus);
        document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      }
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
      }
    };
  }, [clearTitleFlash]);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationPermission(perm);
      } catch {
        // ignore
      }
    }
  }, []);

  const notifyIncomingMessage = useCallback(
    (author: string, text: string, isMention: boolean) => {
      playNeoChime(isMention);

      if (typeof document !== "undefined" && document.hidden) {
        unreadCountRef.current += 1;
        const count = unreadCountRef.current;

        if (titleIntervalRef.current) {
          clearInterval(titleIntervalRef.current);
        }

        let flash = false;
        titleIntervalRef.current = window.setInterval(() => {
          flash = !flash;
          if (flash) {
            document.title = isMention
              ? `(@) [MENTION] Vortex`
              : `(${count}) [TRANSMISSION] Vortex`;
          } else {
            document.title = ORIGINAL_TITLE;
          }
        }, 1000);

        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification(isMention ? `@${author} mentioned you` : `New transmission from ${author}`, {
              body: text.length > 80 ? `${text.slice(0, 77)}...` : text,
              icon: "/vortex-logo.png",
            });
          } catch {
            // ignore
          }
        }
      }
    },
    []
  );

  return {
    notificationPermission,
    requestNotificationPermission,
    notifyIncomingMessage,
    clearTitleFlash,
  };
}
