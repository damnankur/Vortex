"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { io as createSocket, Socket } from "socket.io-client";
import type { CurrentUser, ChatMessage, PresenceUser } from "../types/chat";
import type { Server, ServerMember, Channel } from "../types/server";
import { useNotifications } from "../hooks/useNotifications";
import { useAuth } from "../hooks/useAuth";
import { useServers } from "../hooks/useServers";
import { useChannels } from "../hooks/useChannels";
import { useMessages } from "../hooks/useMessages";
import { usePresence } from "../hooks/usePresence";

import type { ISocketContext, Message } from "../types/socket";

export type { Message, ISocketContext };
export type { CurrentUser, ChatMessage, PresenceUser, Server, ServerMember, Channel };

const SocketContext = createContext<ISocketContext | null>(null);

export const useSocket = () => {
  const state = useContext(SocketContext);
  if (!state) throw new Error("useSocket must be used within SocketProvider");
  return state;
};

const DEFAULT_ROOM = "general";

export const SocketProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const tokenRef = useRef<string | null>(null);

  const baseUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";

  const {
    notificationPermission,
    requestNotificationPermission,
    notifyIncomingMessage,
    clearTitleFlash,
  } = useNotifications();

  const serversHook = useServers(baseUrl, tokenRef);
  const { servers, activeServer, serverMembers, setActiveServer, activeServerRef, fetchServers, fetchServerMembers } =
    serversHook;

  const messagesHook = useMessages(
    baseUrl,
    socketRef,
    // activeRoomRef will be linked below
    useRef(DEFAULT_ROOM)
  );
  const { messagesByRoom, loadingRooms, fetchHistory, sendMessage, addIncomingMessage, clearMessages } =
    messagesHook;

  const channelsHook = useChannels(
    baseUrl,
    tokenRef,
    activeServerRef,
    (slug, token) => {
      const s = socketRef.current;
      if (s?.connected) s.emit("channel:join", { slug });
      fetchHistory(slug, token).catch(() => undefined);
      presenceHook.setTypingByRoom((prev) => ({ ...prev, [slug]: [] }));
    },
    (slug, token) => {
      fetchHistory(slug, token).catch(() => undefined);
    }
  );
  const { channels, setChannels, activeChannel, setActiveChannel, activeRoomRef, fetchChannels, switchChannel, createChannel, joinChannelWithCode } =
    channelsHook;

  // Link activeRoomRef
  messagesHook.fetchHistory = fetchHistory;

  const presenceHook = usePresence(socketRef);
  const { onlineUsers, typingByRoom, emitTyping, handleTypingEvent, clearPresence } = presenceHook;

  const initSocket = useCallback(
    async (token: string, user: CurrentUser) => {
      tokenRef.current = token;
      if (socketRef.current) socketRef.current.disconnect();

      const s = createSocket(baseUrl, {
        transports: ["websocket"],
        auth: { token },
      });
      socketRef.current = s;
      setSocket(s);

      s.on("connect", async () => {
        setConnected(true);
        const fetchedServers = await fetchServers(token);
        const firstServer = fetchedServers.find((srv) => srv.slug === "vortex-main") || fetchedServers[0];

        if (firstServer) {
          setActiveServer(firstServer);
          activeServerRef.current = firstServer;
          fetchServerMembers(firstServer.slug, token).catch(() => undefined);
          const chList = await fetchChannels(firstServer.slug, token);
          const defaultCh = firstServer.defaultChannelSlug || chList[0]?.slug || DEFAULT_ROOM;
          setActiveChannel(defaultCh);
          activeRoomRef.current = defaultCh;
          s.emit("channel:join", { slug: defaultCh });
          fetchHistory(defaultCh, token).catch(() => undefined);
        }
      });

      s.on("disconnect", () => setConnected(false));

      s.on("message", (raw: string) => {
        try {
          const msg = JSON.parse(raw) as ChatMessage;
          addIncomingMessage(msg);
          const isOwn = msg.userId === user.id;
          if (!isOwn) {
            const isMention = user.username ? msg.text.includes(`@${user.username}`) : false;
            notifyIncomingMessage(msg.username || "Operator", msg.text, isMention);
          }
        } catch {}
      });

      s.on("presence", (p: { roomId: string; users: PresenceUser[] }) => {
        if (p.roomId === activeRoomRef.current) presenceHook.setOnlineUsers(p.users);
      });

      s.on("typing", handleTypingEvent);

      s.on("channel:created", (ch: Channel & { serverSlug?: string }) => {
        if (!ch.serverSlug || ch.serverSlug === activeServerRef.current?.slug) {
          setChannels((prev) => (prev.some((c) => c.slug === ch.slug) ? prev : [...prev, ch]));
        }
      });
    },
    [
      baseUrl,
      fetchServers,
      setActiveServer,
      activeServerRef,
      fetchServerMembers,
      fetchChannels,
      setActiveChannel,
      activeRoomRef,
      fetchHistory,
      addIncomingMessage,
      notifyIncomingMessage,
      presenceHook,
      handleTypingEvent,
      setChannels,
    ]
  );

  const authHook = useAuth(baseUrl, initSocket);
  const { currentUser, loadingAuth, error, login, register, join, reset: resetAuth } = authHook;

  const reset = useCallback(() => {
    resetAuth();
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocket(null);
    tokenRef.current = null;
    clearMessages();
    serversHook.setServers([]);
    setActiveServer(null);
    serversHook.setServerMembers([]);
    setChannels([]);
    setActiveChannel(DEFAULT_ROOM);
    activeRoomRef.current = DEFAULT_ROOM;
    clearPresence();
    clearTitleFlash();
  }, [
    resetAuth,
    clearMessages,
    serversHook,
    setActiveServer,
    setChannels,
    setActiveChannel,
    activeRoomRef,
    clearPresence,
    clearTitleFlash,
  ]);

  const switchServer = useCallback(
    async (serverSlug: string) => {
      const target = servers.find((s) => s.slug === serverSlug) || servers[0];
      if (!target) return;
      setActiveServer(target);
      activeServerRef.current = target;

      const token = tokenRef.current;
      if (token) {
        fetchServerMembers(target.slug, token).catch(() => undefined);
        const chList = await fetchChannels(target.slug, token);
        const firstCh = target.defaultChannelSlug || chList[0]?.slug || DEFAULT_ROOM;
        setActiveChannel(firstCh);
        activeRoomRef.current = firstCh;
        const s = socketRef.current;
        if (s?.connected) s.emit("channel:join", { slug: firstCh });
        fetchHistory(firstCh, token).catch(() => undefined);
      }
    },
    [servers, setActiveServer, activeServerRef, fetchServerMembers, fetchChannels, setActiveChannel, activeRoomRef, fetchHistory]
  );

  const leaveServer = useCallback(
    async (serverSlug: string) => {
      await serversHook.leaveServer(
        serverSlug,
        async (nextServer) => {
          await switchServer(nextServer.slug);
        },
        () => {
          setChannels([]);
        }
      );
    },
    [serversHook, switchServer, setChannels]
  );

  const serverMemberIds = new Set(serverMembers.map((m) => m.userId));
  const serverOnlineUsers = onlineUsers.filter((u) => serverMemberIds.has(u.userId));

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
        createServer: (name, desc) => serversHook.createServer(name, desc, async (s) => switchServer(s.slug)),
        joinServerByCode: (code) => serversHook.joinServerByCode(code, async (s) => switchServer(s.slug)),
        leaveServer,
        createChannel,
        joinChannelWithCode,
        sendMessage,
        emitTyping,
        messages: messagesByRoom[activeChannel] || [],
        messagesByRoom,
        channels,
        activeChannel,
        switchChannel,
        prefetchChannel: channelsHook.prefetchChannel,
        channelLoading: Boolean(loadingRooms[activeChannel]),
        channelLoaded: Boolean(messagesByRoom[activeChannel]),
        connected,
        joined: Boolean(currentUser),
        currentUser,
        onlineUsers,
        typingUsers: typingByRoom[activeChannel] || [],
        error,
        loadingAuth,
        loadingHistory: Boolean(loadingRooms[activeChannel]),
        notificationPermission,
        requestNotificationPermission,
        socket,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};