export interface CurrentUser {
  id: string;
  username: string;
}

export interface ChatMessage {
  id?: string;
  messageId: string;
  roomId: string;
  userId: string;
  username: string | null;
  text: string;
  createdAt: string;
}

export interface PresenceUser {
  userId: string;
  username: string;
  connectedAt: string;
}

export interface TypingEvent {
  userId: string;
  username: string;
  roomId: string;
  typing: boolean;
}
