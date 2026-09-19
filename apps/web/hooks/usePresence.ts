import { useState, useCallback, useRef } from "react";
import type { PresenceUser } from "../types/chat";
import type { Socket } from "socket.io-client";

export function usePresence(socketRef: React.MutableRefObject<Socket | null>) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [typingByRoom, setTypingByRoom] = useState<Record<string, string[]>>({});
  const lastTypingSentRef = useRef(0);
  const typingTimersRef = useRef<Record<string, number>>({});

  const emitTyping = useCallback((typing: boolean) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    if (typing) {
      const now = Date.now();
      if (now - lastTypingSentRef.current < 2000) return;
      lastTypingSentRef.current = now;
    }
    s.emit(typing ? "typing:start" : "typing:stop");
  }, [socketRef]);

  const handleTypingEvent = useCallback(
    (payload: { userId: string; username: string; roomId: string; typing: boolean }) => {
      const { userId, username, roomId, typing } = payload;
      const key = `${roomId}:${userId}`;

      if (typing) {
        if (typingTimersRef.current[key]) {
          window.clearTimeout(typingTimersRef.current[key]);
        }

        setTypingByRoom((prev) => {
          const list = prev[roomId] || [];
          if (list.includes(username)) return prev;
          return { ...prev, [roomId]: [...list, username] };
        });

        typingTimersRef.current[key] = window.setTimeout(() => {
          setTypingByRoom((prev) => {
            const list = prev[roomId] || [];
            return { ...prev, [roomId]: list.filter((u) => u !== username) };
          });
          delete typingTimersRef.current[key];
        }, 4000);
      } else {
        if (typingTimersRef.current[key]) {
          window.clearTimeout(typingTimersRef.current[key]);
          delete typingTimersRef.current[key];
        }
        setTypingByRoom((prev) => {
          const list = prev[roomId] || [];
          return { ...prev, [roomId]: list.filter((u) => u !== username) };
        });
      }
    },
    []
  );

  const clearPresence = useCallback(() => {
    setOnlineUsers([]);
    setTypingByRoom({});
    Object.values(typingTimersRef.current).forEach((t) => window.clearTimeout(t));
    typingTimersRef.current = {};
  }, []);

  return {
    onlineUsers,
    setOnlineUsers,
    typingByRoom,
    setTypingByRoom,
    emitTyping,
    handleTypingEvent,
    clearPresence,
  };
}

