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

export interface Channel {
  slug: string;
  name: string;
  type: string;
  topic?: string;
  isPrivate?: boolean;
  isMember?: boolean;
}
