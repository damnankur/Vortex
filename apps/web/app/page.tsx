"use client";
import { useState, useRef, useEffect } from "react";
import { useSocket } from "../context/SocketProvider";
import classes from "./page.module.css";

export default function Page() {
  const { sendMessage, messages, connected } = useSocket();
  const [message, setMessage] = useState("");
  const [username, setUsername] = useState("");
  const [joined, setJoined] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleJoin = () => {
    if (username.trim()) setJoined(true);
  };

  const handleSend = () => {
    if (message.trim() && connected) {
      sendMessage(JSON.stringify({ user: username, text: message }));
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (joined) handleSend();
      else handleJoin();
    }
  };

  const parseMsg = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      return { user: parsed.user || "anon", text: parsed.text || raw };
    } catch {
      return { user: "anon", text: raw };
    }
  };

  if (!joined) {
    return (
      <div className={classes.usernameModal}>
        <div className={classes.usernameCard}>
          <div className={classes.usernameTitle}>Vortex</div>
          <div className={classes.usernameSub}>Enter a name to join the chat</div>
          <input
            className={classes.usernameInput}
            placeholder="Your name..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            maxLength={20}
          />
          <button
            className={classes.usernameBtn}
            onClick={handleJoin}
            disabled={!username.trim()}
          >
            Join Chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={classes.wrapper}>
      <div className={classes.header}>
        <div className={classes.title}>Vortex</div>
        <div className={classes.status}>
          <div className={`${classes.dot} ${connected ? classes.dotOnline : ""}`} />
          {connected ? "Connected" : "Reconnecting..."}
        </div>
      </div>

      <div className={classes.messages}>
        {messages.length === 0 ? (
          <div className={classes.emptyState}>
            <div className={classes.emptyIcon}>~</div>
            <div className={classes.emptyText}>No messages yet. Say hello!</div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const parsed = parseMsg(msg.text);
            const isOwn = parsed.user === username;
            return (
              <div
                key={i}
                className={`${classes.message} ${isOwn ? classes.messageOwn : classes.messageOther}`}
              >
                {!isOwn && <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2, opacity: 0.7 }}>{parsed.user}</div>}
                {parsed.text}
                <div className={classes.messageTime}>{msg.time}</div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={classes.inputArea}>
        <div className={classes.inputRow}>
          <input
            className={classes.input}
            placeholder={connected ? "Type a message..." : "Waiting for connection..."}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!connected}
          />
          <button
            className={classes.sendBtn}
            onClick={handleSend}
            disabled={!connected || !message.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
