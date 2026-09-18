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

export interface Channel {
  slug: string;
  name: string;
}

export interface PresenceUser {
  userId: string;
  username: string;
  connectedAt: string;
}

interface ISocketContext {
  join: (username: string) => Promise<void>;
  reset: () => void;
  sendMessage: (text: string) => void;
  emitTyping: (typing: boolean) => void;
  switchChannel: (slug: string) => void;
  messages: Message[];
  channels: Channel[];
  activeChannel: string;
  onlineUsers: PresenceUser[];
  typingUsers: string[];
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

const DEFAULT_ROOM = "general";

export const SocketProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, Message[]>>({});
  const [connected, setConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState(DEFAULT_ROOM);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [typingByRoom, setTypingByRoom] = useState<Record<string, string[]>>({});

  const socketRef = useRef<Socket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const activeRoomRef = useRef(DEFAULT_ROOM);
  const lastTypingSentRef = useRef(0);
  const typingTimersRef = useRef<Record<string, number>>({});

  const baseUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";

  const fetchHistory = useCallback(async (roomId: string, token: string) => {
    const res = await fetch(
      `${baseUrl}/messages?roomId=${encodeURIComponent(roomId)}&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error("failed to load history");
    const data = (await res.json()) as { messages: Message[] };
    setMessagesByRoom((prev) => ({ ...prev, [roomId]: data.messages }));
  }, [baseUrl]);

  const fetchChannels = useCallback(async (token: string) => {
    const res = await fetch(`${baseUrl}/channels`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("failed to load channels");
    const data = (await res.json()) as { channels: Channel[] };
    setChannels(data.channels);
  }, [baseUrl]);

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
      tokenRef.current = data.token;

      const _socket = io(baseUrl, {
        auth: { token: data.token },
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        timeout: 10000,
      });

      const upsertMessage = (msg: Message) => {
        setMessagesByRoom((prev) => {
          const existing = prev[msg.roomId] || [];
          if (existing.some((m) => m.messageId === msg.messageId)) return prev;
          return {
            ...prev,
            [msg.roomId]: [...existing, msg].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt)
            ),
          };
        });
      };

      _socket.on("connect", () => {
        setConnected(true);
        fetchChannels(data.token).catch((err) =>
          setError(err instanceof Error ? err.message : "failed to load channels")
        );
        fetchHistory(DEFAULT_ROOM, data.token).catch((err) =>
          setError(err instanceof Error ? err.message : "failed to load history")
        );
      });
      _socket.on("disconnect", () => setConnected(false));
      _socket.on("connect_error", () => setConnected(false));
      _socket.on("message", (raw: string) => {
        try {
          upsertMessage(JSON.parse(raw) as Message);
        } catch {
          // ignore malformed frames
        }
      });
      _socket.on("presence", (payload: { roomId: string; users: PresenceUser[] }) => {
        if (payload.roomId === activeRoomRef.current) {
          setOnlineUsers(payload.users);
        }
      });
      _socket.on("typing", (payload: { roomId: string; username: string; typing: boolean }) => {
        setTypingByRoom((prev) => {
          const current = prev[payload.roomId] || [];
          const next = current.filter((name) => name !== payload.username);
          if (payload.typing) next.push(payload.username);
          const key = `${payload.roomId}:${payload.username}`;
          if (payload.typing) {
            if (typingTimersRef.current[key]) {
              window.clearTimeout(typingTimersRef.current[key]);
            }
            typingTimersRef.current[key] = window.setTimeout(() => {
              setTypingByRoom((cur) => ({
                ...cur,
                [payload.roomId]: (cur[payload.roomId] || []).filter(
                  (name) => name !== payload.username
                ),
              }));
              delete typingTimersRef.current[key];
            }, 4000);
          }
          return { ...prev, [payload.roomId]: next };
        });
      });
      _socket.on("error", (msg: string) => setError(msg));

      socketRef.current = _socket;
    },
    [baseUrl, fetchChannels, fetchHistory]
  );

  const reset = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    tokenRef.current = null;
    setCurrentUser(null);
    setMessagesByRoom({});
    setChannels([]);
    setActiveChannel(DEFAULT_ROOM);
    activeRoomRef.current = DEFAULT_ROOM;
    setOnlineUsers([]);
    setTypingByRoom({});
    setError(null);
  }, []);

  const switchChannel = useCallback(
    (slug: string) => {
      if (slug === activeRoomRef.current) return;
      activeRoomRef.current = slug;
      setActiveChannel(slug);
      const s = socketRef.current;
      if (s && s.connected) {
        s.emit("channel:join", { slug });
      }
      const token = tokenRef.current;
      if (token) {
        fetchHistory(slug, token).catch(() => undefined);
      }
      setTypingByRoom((prev) => ({ ...prev, [slug]: [] }));
    },
    [fetchHistory]
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
  }, []);

  const emitTyping = useCallback((typing: boolean) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;
    if (typing) {
      const now = Date.now();
      if (now - lastTypingSentRef.current < 2000) return;
      lastTypingSentRef.current = now;
    }
    s.emit(typing ? "typing:start" : "typing:stop");
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
      Object.values(typingTimersRef.current).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const messages = messagesByRoom[activeChannel] || [];

  return (
    <SocketContext.Provider
      value={{
        join,
        reset,
        sendMessage,
        emitTyping,
        switchChannel,
        messages,
        channels,
        activeChannel,
        onlineUsers,
        typingUsers: typingByRoom[activeChannel] || [],
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