import type { Socket } from "socket.io-client";
import type { CurrentUser, ChatMessage, PresenceUser } from "./chat";
import type { Server, ServerMember, Channel } from "./server";

export type Message = ChatMessage;

export interface ISocketContext {
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, serverInviteCode?: string) => Promise<void>;
  join: (username: string) => Promise<void>;
  reset: () => void;
  servers: Server[];
  activeServer: Server | null;
  serverMembers: ServerMember[];
  serverOnlineUsers: PresenceUser[];
  switchServer: (serverSlug: string) => Promise<void>;
  createServer: (name: string, description?: string) => Promise<Server>;
  joinServerByCode: (inviteCode: string) => Promise<Server>;
  leaveServer: (serverSlug: string) => Promise<void>;
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
  messages: Message[];
  messagesByRoom: Record<string, Message[]>;
  channels: Channel[];
  activeChannel: string;
  switchChannel: (slug: string) => void;
  prefetchChannel: (slug: string) => void;
  channelLoading: boolean;
  channelLoaded: boolean;
  connected: boolean;
  joined: boolean;
  currentUser: CurrentUser | null;
  onlineUsers: PresenceUser[];
  typingUsers: string[];
  error: string | null;
  loadingAuth: boolean;
  loadingHistory: boolean;
  notificationPermission: NotificationPermission;
  requestNotificationPermission: () => Promise<void>;
  socket: Socket | null;
}

