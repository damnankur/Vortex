import { useState, useCallback, useRef } from "react";
import type { Server, ServerMember } from "../types/server";

export function useServers(
  baseUrl: string,
  tokenRef: React.MutableRefObject<string | null>
) {
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServer, setActiveServer] = useState<Server | null>(null);
  const [serverMembers, setServerMembers] = useState<ServerMember[]>([]);

  const activeServerRef = useRef<Server | null>(null);
  activeServerRef.current = activeServer;

  const fetchServerMembers = useCallback(
    async (serverSlug: string, token: string) => {
      try {
        const res = await fetch(`${baseUrl}/servers/${encodeURIComponent(serverSlug)}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { members: ServerMember[] };
        setServerMembers(data.members);
      } catch {
        // ignore
      }
    },
    [baseUrl]
  );

  const fetchServers = useCallback(
    async (token: string): Promise<Server[]> => {
      try {
        const res = await fetch(`${baseUrl}/servers`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return [];
        const data = (await res.json()) as { servers: Server[] };
        setServers(data.servers);
        return data.servers;
      } catch {
        return [];
      }
    },
    [baseUrl]
  );

  const createServer = useCallback(
    async (
      name: string,
      description: string | undefined,
      onServerReady: (server: Server) => Promise<void>
    ): Promise<Server> => {
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

      await onServerReady(data.server);
      return data.server;
    },
    [baseUrl, tokenRef]
  );

  const joinServerByCode = useCallback(
    async (
      inviteCode: string,
      onServerReady: (server: Server) => Promise<void>
    ): Promise<Server> => {
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

      await onServerReady(data.server);
      return data.server;
    },
    [baseUrl, tokenRef]
  );

  const leaveServer = useCallback(
    async (
      serverSlug: string,
      onFallbackServer: (nextServer: Server) => Promise<void>,
      onNoServersLeft: () => void
    ): Promise<void> => {
      const token = tokenRef.current;
      if (!token) throw new Error("Not authenticated");

      if (servers.length <= 1) {
        throw new Error("Cannot leave your only server. Join or create another server first.");
      }

      const res = await fetch(`${baseUrl}/servers/${encodeURIComponent(serverSlug)}/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to leave server");
      }

      const remainingServers = servers.filter((s) => s.slug !== serverSlug);
      setServers(remainingServers);

      if (activeServerRef.current?.slug === serverSlug) {
        const nextServer = remainingServers[0];
        if (nextServer) {
          await onFallbackServer(nextServer);
        } else {
          setActiveServer(null);
          setServerMembers([]);
          onNoServersLeft();
        }
      }
    },
    [baseUrl, servers, tokenRef]
  );

  return {
    servers,
    setServers,
    activeServer,
    setActiveServer,
    activeServerRef,
    serverMembers,
    setServerMembers,
    fetchServers,
    fetchServerMembers,
    createServer,
    joinServerByCode,
    leaveServer,
  };
}
