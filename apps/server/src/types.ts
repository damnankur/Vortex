export interface ChatMessage {
  messageId: string;
  roomId: string;
  userId: string;
  username: string;
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
