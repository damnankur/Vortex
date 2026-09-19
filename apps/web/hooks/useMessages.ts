import { useState, useCallback, useRef } from "react";
import type { ChatMessage } from "../types/chat";
import type { Socket } from "socket.io-client";

function genMessageId(): string {
  return crypto.randomUUID();
}

export function useMessages(
  baseUrl: string,
  socketRef: React.MutableRefObject<Socket | null>,
  activeRoomRef: React.MutableRefObject<string>
) {
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, ChatMessage[]>>({});
  const [loadingRooms, setLoadingRooms] = useState<Record<string, boolean>>({});
  const inFlightFetchesRef = useRef<Set<string>>(new Set());

  const fetchHistory = useCallback(
    async (roomId: string, token: string) => {
      if (inFlightFetchesRef.current.has(roomId)) return;
      inFlightFetchesRef.current.add(roomId);
      setLoadingRooms((prev) => ({ ...prev, [roomId]: true }));

      try {
        const res = await fetch(
          `${baseUrl}/messages?roomId=${encodeURIComponent(roomId)}&limit=50`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { messages: ChatMessage[] };
        setMessagesByRoom((prev) => ({ ...prev, [roomId]: data.messages }));
      } catch {
        // ignore history fetch error
      } finally {
        inFlightFetchesRef.current.delete(roomId);
        setLoadingRooms((prev) => ({ ...prev, [roomId]: false }));
      }
    },
    [baseUrl]
  );

  const sendMessage = useCallback((text: string) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    s.emit("typing:stop");
    s.emit("event: message", {
      messageId: genMessageId(),
      text,
      roomId: activeRoomRef.current,
    });
  }, [activeRoomRef, socketRef]);

  const addIncomingMessage = useCallback((msg: ChatMessage) => {
    setMessagesByRoom((prev) => {
      const roomMsgs = prev[msg.roomId] || [];
      if (roomMsgs.some((m) => m.messageId === msg.messageId)) return prev;
      return {
        ...prev,
        [msg.roomId]: [...roomMsgs, msg],
      };
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessagesByRoom({});
    setLoadingRooms({});
    inFlightFetchesRef.current.clear();
  }, []);

  return {
    messagesByRoom,
    loadingRooms,
    fetchHistory,
    sendMessage,
    addIncomingMessage,
    clearMessages,
  };
}
