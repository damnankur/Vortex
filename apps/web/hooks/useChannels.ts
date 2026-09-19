import { useState, useCallback, useRef } from "react";
import type { Channel, Server } from "../types/server";

const DEFAULT_ROOM = "general";

export function useChannels(
  baseUrl: string,
  tokenRef: React.MutableRefObject<string | null>,
  activeServerRef: React.MutableRefObject<Server | null>,
  onChannelChanged: (slug: string, token: string) => void,
  onPrefetchHistory: (slug: string, token: string) => void
) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState(DEFAULT_ROOM);

  const activeRoomRef = useRef(DEFAULT_ROOM);

  const fetchChannels = useCallback(
    async (serverSlug: string, token: string): Promise<Channel[]> => {
      try {
        const res = await fetch(
          `${baseUrl}/channels?serverSlug=${encodeURIComponent(serverSlug)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return [];
        const data = (await res.json()) as { channels: Channel[] };
        setChannels(data.channels);

        // Auto-prefetch first 10 channels for 0ms switching
        data.channels.slice(0, 10).forEach((ch) => {
          onPrefetchHistory(ch.slug, token);
        });

        return data.channels;
      } catch {
        return [];
      }
    },
    [baseUrl, onPrefetchHistory]
  );

  const switchChannel = useCallback(
    (slug: string) => {
      if (slug === activeRoomRef.current) return;
      activeRoomRef.current = slug;
      setActiveChannel(slug);

      const token = tokenRef.current;
      if (token) {
        onChannelChanged(slug, token);
      }
    },
    [onChannelChanged, tokenRef]
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
      if (!data.channel || data.channel.type === "CHANNEL") {
        setChannels((prev) => {
          if (prev.some((c) => c.slug === data.channel.slug)) return prev;
          return [...prev, data.channel];
        });
      }
      return data.channel;
    },
    [baseUrl, activeServerRef, tokenRef]
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
    [baseUrl, switchChannel, tokenRef]
  );

  const prefetchChannel = useCallback(
    (slug: string) => {
      const token = tokenRef.current;
      if (!token) return;
      onPrefetchHistory(slug, token);
    },
    [onPrefetchHistory, tokenRef]
  );

  return {
    channels,
    setChannels,
    activeChannel,
    setActiveChannel,
    activeRoomRef,
    fetchChannels,
    switchChannel,
    createChannel,
    joinChannelWithCode,
    prefetchChannel,
  };
}
