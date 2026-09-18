"use client";
import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export interface Message {
  messageId: string;
  roomId: string;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
}

export interface CurrentUser {
  id: string;
  username: string;
}

interface ISocketContext {
  join: (username: string) => Promise<void>;
  sendMessage: (text: string) => void;
  messages: Message[];
  connected: boolean;
  joined: boolean;
  currentUser: CurrentUser | null;
  error: string | null;
}

const SocketContext = React.createContext<ISocketContext | null>(null);

export const useSocket = () => {
  const state = useContext(SocketContext);
  if (!state) throw new Error("useSocket must be used within SocketProvider");
  return state;
};

function genMessageId(): string {
  return crypto.randomUUID();
}

export const SocketProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const baseUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";

  const fetchHistory = useCallback(
    async (token: string) => {
      const res = await fetch(`${baseUrl}/messages?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("failed to load history");
      const data = (await res.json()) as { messages: Message[] };
      setMessages(data.messages);
    },
    [baseUrl]
  );

  const join = useCallback(
    async (username: string) => {
      setError(null);
      const res = await fetch(`${baseUrl}/auth/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "join failed");
      }
      const data = (await res.json()) as { token: string; user: CurrentUser };
      setCurrentUser(data.user);

      const _socket = io(baseUrl, {
        auth: { token: data.token },
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        timeout: 10000,
      });

      _socket.on("connect", () => {
        setConnected(true);
        fetchHistory(data.token).catch((err) =>
          setError(err instanceof Error ? err.message : "failed to load history")
        );
      });
      _socket.on("disconnect", () => setConnected(false));
      _socket.on("connect_error", () => setConnected(false));
      _socket.on("message", (raw: string) => {
        try {
          const msg = JSON.parse(raw) as Message;
          setMessages((prev) =>
            prev.some((m) => m.messageId === msg.messageId)
              ? prev
              : [...prev, msg].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          );
        } catch {
          // ignore malformed frames
        }
      });
      _socket.on("error", (msg: string) => setError(msg));

      socketRef.current = _socket;
    },
    [baseUrl, fetchHistory]
  );

  const sendMessage = useCallback((text: string) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    s.emit("event: message", { messageId: genMessageId(), text });
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  return (
    <SocketContext.Provider
      value={{
        join,
        sendMessage,
        messages,
        connected,
        joined: !!currentUser,
        currentUser,
        error,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
