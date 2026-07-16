"use client";
import React, { useCallback, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

interface SocketProviderProps {
  children?: React.ReactNode;
}

interface ISocketContext {
  sendMessage: (msg: string) => void;
  messages: { text: string; time: string }[];
  connected: boolean;
}

const SocketContext = React.createContext<ISocketContext | null>(null);

export const useSocket = () => {
  const state = useContext(SocketContext);
  if (!state) throw new Error("useSocket must be used within SocketProvider");
  return state;
};

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket>();
  const [messages, setMessages] = useState<{ text: string; time: string }[]>([]);
  const [connected, setConnected] = useState(false);

  const sendMessage: ISocketContext["sendMessage"] = useCallback(
    (msg) => {
      if (socket && connected) {
        socket.emit("event: message", { message: msg });
      }
    },
    [socket, connected]
  );

  const onMessageRec = useCallback((msg: string) => {
    try {
      const { message } = JSON.parse(msg) as { message: string };
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setMessages((prev) => [...prev, { text: message, time }]);
    } catch {}
  }, []);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";
    const _socket = io(url, {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000,
    });

    _socket.on("connect", () => setConnected(true));
    _socket.on("disconnect", () => setConnected(false));
    _socket.on("connect_error", () => setConnected(false));
    _socket.on("message", onMessageRec);

    setSocket(_socket);

    return () => {
      _socket.off("message", onMessageRec);
      _socket.off("connect");
      _socket.off("disconnect");
      _socket.disconnect();
      setSocket(undefined);
      setConnected(false);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ sendMessage, messages, connected }}>
      {children}
    </SocketContext.Provider>
  );
};
