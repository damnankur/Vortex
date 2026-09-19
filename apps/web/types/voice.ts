export interface VoiceUser {
  userId: string;
  username: string;
  socketId: string;
  isMuted?: boolean;
}

export interface VoiceSignalPayload {
  senderSocketId: string;
  senderUserId: string;
  senderUsername: string;
  signal: {
    type?: "offer" | "answer";
    sdp?: string;
    candidate?: RTCIceCandidateInit;
  };
}

export interface VoiceState {
  activeVoiceChannel: string | null;
  voiceParticipants: VoiceUser[];
  isVoiceConnected: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  speakingUsers: Set<string>;
  voiceChannelCounts: Record<string, number>;
  voiceChannelUsers: Record<string, VoiceUser[]>;
  voiceError: string | null;
}

