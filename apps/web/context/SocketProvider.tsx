"use client";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  isPrivate?: boolean;
  isMember?: boolean;
  serverSlug?: string;
}

export interface Server {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  iconUrl?: string | null;
  inviteCode: string;
  isOwner?: boolean;
  role?: string;
  memberCount?: number;
  channelCount?: number;
  defaultChannelSlug?: string;
}

export interface ServerMember {
  userId: string;
  username: string;
  role: string;
}

export interface PresenceUser {
  userId: string;
  username: string;
  connectedAt: string;
}

interface ISocketContext {
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, serverInviteCode?: string) => Promise<void>;
  join: (username: string) => Promise<void>;
  reset: () => void;
  // Server actions
  servers: Server[];
  activeServer: Server | null;
  serverMembers: ServerMember[];
  serverOnlineUsers: PresenceUser[];
  switchServer: (serverSlug: string) => Promise<void>;
  createServer: (name: string, description?: string) => Promise<Server>;
  joinServerByCode: (inviteCode: string) => Promise<Server>;
  leaveServer: (serverSlug: string) => Promise<void>;
  // Channel actions
  createChannel: (
    name: string,
    slug?: string,
    isPrivate?: boolean,
    inviteCode?: string,
    serverSlug?: string
  ) => Promise<Channel>;
  joinChannelWithCode: (slug: string, inviteCode: string) => Promise<void>;
  sendMessage: (text: string) => void;
  emitTyping: (typing: boolean) => void;
  switchChannel: (slug: string) => void;
  prefetchChannel: (slug: string) => void;
  channelLoading: boolean;
  channelLoaded: boolean;
  messages: Message[];
  channels: Channel[];
  activeChannel: string;
  onlineUsers: PresenceUser[];
  typingUsers: string[];
  connected: boolean;
  joined: boolean;
  currentUser: CurrentUser | null;
  error: string | null;
  loadingAuth: boolean;
  // Notifications
  notificationPermission: NotificationPermission;
  requestNotificationPermission: () => Promise<void>;
  socket: Socket | null;
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

function playNeoChime(isMention = false) {
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

const DEFAULT_ROOM = "general";
const ORIGINAL_TITLE = "Vortex - Real-time Chat";

export const SocketProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, Message[]>>({});
  const [connected, setConnected] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServer, setActiveServer] = useState<Server | null>(null);
  const [serverMembers, setServerMembers] = useState<ServerMember[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState(DEFAULT_ROOM);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [typingByRoom, setTypingByRoom] = useState<Record<string, string[]>>({});
  const [loadingRooms, setLoadingRooms] = useState<Record<string, boolean>>({});
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [socket, setSocket] = useState<Socket | null>(null);

  const inFlightFetchesRef = useRef<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const currentUserRef = useRef<CurrentUser | null>(null);
  const activeRoomRef = useRef(DEFAULT_ROOM);
  const activeServerRef = useRef<Server | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingTimersRef = useRef<Record<string, number>>({});
  const unreadCountRef = useRef(0);
  const titleIntervalRef = useRef<number | null>(null);

  currentUserRef.current = currentUser;
  activeServerRef.current = activeServer;

  const baseUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";

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
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load messages");
        }
        const data = (await res.json()) as { messages: Message[] };
        setMessagesByRoom((prev) => ({ ...prev, [roomId]: data.messages }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load messages");
      } finally {
        inFlightFetchesRef.current.delete(roomId);
        setLoadingRooms((prev) => ({ ...prev, [roomId]: false }));
      }
    },
    [baseUrl]
  );

  const prefetchChannel = useCallback(
    (slug: string) => {
      const token = tokenRef.current;
      if (!token) return;
      if (inFlightFetchesRef.current.has(slug)) return;
      fetchHistory(slug, token).catch(() => undefined);
    },
    [fetchHistory]
  );

  const fetchChannels = useCallback(
    async (serverSlug: string, token: string): Promise<Channel[]> => {
      try {
        const res = await fetch(`${baseUrl}/channels?serverSlug=${encodeURIComponent(serverSlug)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load channels");
        const data = (await res.json()) as { channels: Channel[] };
        setChannels(data.channels);

        // Pre-warm client cache for channels in parallel
        if (data.channels && data.channels.length > 0) {
          data.channels.slice(0, 10).forEach((ch) => {
            fetchHistory(ch.slug, token).catch(() => undefined);
          });
        }

        return data.channels;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load channels");
        return [];
      }
    },
    [baseUrl, fetchHistory]
  );

  const fetchServers = useCallback(
    async (token: string): Promise<Server[]> => {
      try {
        const res = await fetch(`${baseUrl}/servers`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load servers");
        const data = (await res.json()) as { servers: Server[] };
        setServers(data.servers);
        return data.servers;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load servers");
        return [];
      }
    },
    [baseUrl]
  );

  const fetchServerMembers = useCallback(
    async (serverSlug: string, token: string): Promise<ServerMember[]> => {
      try {
        const res = await fetch(
          `${baseUrl}/servers/${encodeURIComponent(serverSlug)}/members`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error("Failed to load server members");
        const data = (await res.json()) as { members: ServerMember[] };
        setServerMembers(data.members);
        return data.members;
      } catch {
        return [];
      }
    },
    [baseUrl]
  );

  const initSocket = useCallback(
    (token: string, user: CurrentUser) => {
      setCurrentUser(user);
      tokenRef.current = token;

      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      const _socket = io(baseUrl, {
        auth: { token },
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        timeout: 10000,
      });

      socketRef.current = _socket;
      setSocket(_socket);

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
        fetchServers(token)
          .then(async (srvList) => {
            const initialServer =
              srvList.find((s) => s.slug === "vortex-main") || srvList[0] || null;
            if (initialServer) {
              setActiveServer(initialServer);
              activeServerRef.current = initialServer;
              fetchServerMembers(initialServer.slug, token).catch(() => undefined);
              const chList = await fetchChannels(initialServer.slug, token);
              const firstCh = chList[0]?.slug || DEFAULT_ROOM;
              setActiveChannel(firstCh);
              activeRoomRef.current = firstCh;
              fetchHistory(firstCh, token).catch(() => undefined);
            }
          })
          .catch(() => undefined);
      });

      _socket.on("disconnect", () => setConnected(false));
      _socket.on("connect_error", () => setConnected(false));

      _socket.on("message", (raw: string) => {
        try {
          const msg = JSON.parse(raw) as Message;
          upsertMessage(msg);

          // Handle background notification if tab is in background / minimized
          if (typeof document !== "undefined" && document.hidden) {
            const isOwn = currentUserRef.current && msg.userId === currentUserRef.current.id;
            if (!isOwn) {
              const myUsername = currentUserRef.current?.username?.toLowerCase();
              const isMention = Boolean(
                myUsername && msg.text.toLowerCase().includes(`@${myUsername}`)
              );

              // 1. Play Neo-Brutalist Audio Chime
              playNeoChime(isMention);

              // 2. Flash Document Title
              unreadCountRef.current += 1;
              const count = unreadCountRef.current;
              const badge = isMention ? `[@ MENTION]` : `(${count}) [TRANSMISSION]`;

              if (titleIntervalRef.current) clearInterval(titleIntervalRef.current);
              let showNotice = true;
              document.title = `${badge} Vortex`;
              titleIntervalRef.current = window.setInterval(() => {
                showNotice = !showNotice;
                document.title = showNotice ? `${badge} Vortex` : ORIGINAL_TITLE;
              }, 1000);

              // 3. Trigger Desktop Notification
              if ("Notification" in window && Notification.permission === "granted") {
                try {
                  const title = isMention
                    ? `[@${msg.username} mentioned you in #${msg.roomId}]`
                    : `[#${msg.roomId}] ${msg.username}`;
                  new Notification(title, {
                    body: msg.text.length > 120 ? `${msg.text.slice(0, 117)}...` : msg.text,
                    icon: "/vortex-logo.png",
                  });
                } catch {
                  // Ignore notification error
                }
              }
            }
          }
        } catch {
          // ignore malformed frames
        }
      });

      _socket.on("presence", (payload: { roomId: string; users: PresenceUser[] }) => {
        if (payload.roomId === activeRoomRef.current) {
          setOnlineUsers(payload.users);
        }
      });

      _socket.on("channel:created", (newCh: Channel) => {
        const currentServer = activeServerRef.current;
        if (!newCh.serverSlug || !currentServer || newCh.serverSlug === currentServer.slug) {
          setChannels((prev) => {
            if (prev.some((c) => c.slug === newCh.slug)) return prev;
            return [...prev, { ...newCh, isMember: !newCh.isPrivate }];
          });
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
    [baseUrl, fetchChannels, fetchHistory, fetchServers]
  );

  // Auto-login from saved token on mount
  useEffect(() => {
    try {
      const savedToken =
        typeof window !== "undefined" ? localStorage.getItem("vortex_token") : null;
      if (!savedToken) {
        setLoadingAuth(false);
        return;
      }

      setLoadingAuth(true);
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        setLoadingAuth(false);
      }, 2000);

      fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${savedToken}` },
        signal: controller.signal,
      })
        .then(async (res) => {
          clearTimeout(timer);
          if (!res.ok) throw new Error();
          const data = (await res.json()) as { user: CurrentUser };
          initSocket(savedToken, data.user);
        })
        .catch(() => {
          clearTimeout(timer);
          try {
            localStorage.removeItem("vortex_token");
          } catch {}
        })
        .finally(() => {
          setLoadingAuth(false);
        });
    } catch {
      setLoadingAuth(false);
    }
  }, [baseUrl, initSocket]);

  const login = useCallback(
    async (username: string, password: string) => {
      setError(null);
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Login failed");
      }
      const data = (await res.json()) as { token: string; user: CurrentUser };
      localStorage.setItem("vortex_token", data.token);
      initSocket(data.token, data.user);
    },
    [baseUrl, initSocket]
  );

  const register = useCallback(
    async (username: string, password: string, serverInviteCode?: string) => {
      setError(null);
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, serverInviteCode }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Registration failed");
      }
      const data = (await res.json()) as { token: string; user: CurrentUser };
      localStorage.setItem("vortex_token", data.token);
      initSocket(data.token, data.user);
    },
    [baseUrl, initSocket]
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
        throw new Error(body.error || "Join failed");
      }
      const data = (await res.json()) as { token: string; user: CurrentUser };
      localStorage.setItem("vortex_token", data.token);
      initSocket(data.token, data.user);
    },
    [baseUrl, initSocket]
  );

  const switchServer = useCallback(
    async (serverSlug: string) => {
      const targetServer =
        servers.find((s) => s.slug === serverSlug) ||
        servers.find((s) => s.slug === "vortex-main") ||
        servers[0];
      if (!targetServer) return;
      setActiveServer(targetServer);
      activeServerRef.current = targetServer;

      const token = tokenRef.current;
      if (token) {
        fetchServerMembers(targetServer.slug, token).catch(() => undefined);
        const chList = await fetchChannels(targetServer.slug, token);
        if (chList.length > 0 && chList[0]) {
          const firstCh = chList[0].slug;
          setActiveChannel(firstCh);
          activeRoomRef.current = firstCh;
          const s = socketRef.current;
          if (s && s.connected) {
            s.emit("channel:join", { slug: firstCh });
          }
          fetchHistory(firstCh, token).catch(() => undefined);
        } else {
          setChannels([]);
        }
      }
    },
    [baseUrl, fetchChannels, fetchHistory, fetchServerMembers, servers]
  );

  const createServer = useCallback(
    async (name: string, description?: string): Promise<Server> => {
      const token = tokenRef.current;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(`${baseUrl}/servers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, description }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to create server");
      }

      const data = (await res.json()) as { server: Server };
      setServers((prev) => [...prev, data.server]);
      setActiveServer(data.server);
      activeServerRef.current = data.server;

      if (token) {
        fetchServerMembers(data.server.slug, token).catch(() => undefined);
        const chList = await fetchChannels(data.server.slug, token);
        const firstCh = data.server.defaultChannelSlug || chList[0]?.slug || DEFAULT_ROOM;
        setActiveChannel(firstCh);
        activeRoomRef.current = firstCh;
        const s = socketRef.current;
        if (s && s.connected) {
          s.emit("channel:join", { slug: firstCh });
        }
        fetchHistory(firstCh, token).catch(() => undefined);
      }

      return data.server;
    },
    [baseUrl, fetchChannels, fetchHistory, fetchServerMembers]
  );

  const joinServerByCode = useCallback(
    async (inviteCode: string): Promise<Server> => {
      const token = tokenRef.current;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(`${baseUrl}/servers/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inviteCode }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to join server");
      }

      const data = (await res.json()) as { server: Server };
      setServers((prev) => {
        if (prev.some((s) => s.id === data.server.id)) return prev;
        return [...prev, data.server];
      });
      setActiveServer(data.server);
      activeServerRef.current = data.server;

      if (token) {
        fetchServerMembers(data.server.slug, token).catch(() => undefined);
        const chList = await fetchChannels(data.server.slug, token);
        const firstCh = data.server.defaultChannelSlug || chList[0]?.slug || DEFAULT_ROOM;
        setActiveChannel(firstCh);
        activeRoomRef.current = firstCh;
        const s = socketRef.current;
        if (s && s.connected) {
          s.emit("channel:join", { slug: firstCh });
        }
        fetchHistory(firstCh, token).catch(() => undefined);
      }

      return data.server;
    },
    [baseUrl, fetchChannels, fetchHistory, fetchServerMembers]
  );

  const leaveServer = useCallback(
    async (serverSlug: string): Promise<void> => {
      const token = tokenRef.current;
      if (!token) throw new Error("Not authenticated");
      if (serverSlug === "vortex-main") {
        throw new Error("Cannot leave the default community server");
      }

      const res = await fetch(
        `${baseUrl}/servers/${encodeURIComponent(serverSlug)}/leave`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to leave server");
      }

      // Update servers state
      setServers((prev) => prev.filter((s) => s.slug !== serverSlug));

      // If active server was the left server, switch to vortex-main
      if (activeServerRef.current?.slug === serverSlug) {
        await switchServer("vortex-main");
      }
    },
    [baseUrl, switchServer]
  );

  const createChannel = useCallback(
    async (
      name: string,
      slug?: string,
      isPrivate?: boolean,
      inviteCode?: string,
      serverSlug?: string
    ): Promise<Channel> => {
      const token = tokenRef.current;
      if (!token) throw new Error("Not authenticated");

      const targetServerSlug =
        serverSlug || activeServerRef.current?.slug || "vortex-main";

      const res = await fetch(`${baseUrl}/channels`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          slug,
          isPrivate,
          inviteCode,
          serverSlug: targetServerSlug,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to create channel");
      }

      const data = (await res.json()) as { channel: Channel };
      if (!data.channel.serverSlug || data.channel.serverSlug === activeServerRef.current?.slug) {
        setChannels((prev) => {
          if (prev.some((c) => c.slug === data.channel.slug)) return prev;
          return [...prev, data.channel];
        });
      }
      return data.channel;
    },
    [baseUrl]
  );

  const joinChannelWithCode = useCallback(
    async (slug: string, inviteCode: string) => {
      const token = tokenRef.current;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(`${baseUrl}/channels/${encodeURIComponent(slug)}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inviteCode }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to join channel");
      }

      setChannels((prev) =>
        prev.map((c) => (c.slug === slug ? { ...c, isMember: true } : c))
      );
      switchChannel(slug);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseUrl]
  );

  const reset = useCallback(() => {
    localStorage.removeItem("vortex_token");
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocket(null);
    tokenRef.current = null;
    setCurrentUser(null);
    setMessagesByRoom({});
    setLoadingRooms({});
    inFlightFetchesRef.current.clear();
    setServers([]);
    setActiveServer(null);
    setServerMembers([]);
    setChannels([]);
    setActiveChannel(DEFAULT_ROOM);
    activeRoomRef.current = DEFAULT_ROOM;
    setOnlineUsers([]);
    setTypingByRoom({});
    setError(null);
    clearTitleFlash();
  }, [clearTitleFlash]);

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
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
      }
    };
  }, []);

  // Filter online users to strictly members of the active server
  const serverOnlineUsers = useMemo(() => {
    if (!activeServer) return onlineUsers;
    const memberIds = new Set(serverMembers.map((m) => m.userId));
    if (memberIds.size > 0) {
      return onlineUsers.filter((u) => memberIds.has(u.userId));
    }
    // If serverMembers not loaded yet and not vortex-main, only show currentUser if connected
    if (activeServer.slug !== "vortex-main") {
      return currentUser ? onlineUsers.filter((u) => u.userId === currentUser.id) : [];
    }
    return onlineUsers;
  }, [activeServer, onlineUsers, serverMembers, currentUser]);

  const messages = messagesByRoom[activeChannel] || [];
  const channelLoading = !!loadingRooms[activeChannel];
  const channelLoaded = activeChannel in messagesByRoom;

  return (
    <SocketContext.Provider
      value={{
        login,
        register,
        join,
        reset,
        servers,
        activeServer,
        serverMembers,
        serverOnlineUsers,
        switchServer,
        createServer,
        joinServerByCode,
        leaveServer,
        createChannel,
        joinChannelWithCode,
        sendMessage,
        emitTyping,
        switchChannel,
        prefetchChannel,
        channelLoading,
        channelLoaded,
        messages,
        channels,
        activeChannel,
        onlineUsers: serverOnlineUsers,
        typingUsers: typingByRoom[activeChannel] || [],
        connected,
        joined: !!currentUser,
        currentUser,
        error,
        loadingAuth,
        notificationPermission,
        requestNotificationPermission,
        socket,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};