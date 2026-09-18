"use client";
import { useState, useRef, useEffect } from "react";
import { useSocket } from "../context/SocketProvider";
import classes from "./page.module.css";

export default function Page() {
  const { join, sendMessage, messages, connected, joined, currentUser, error } = useSocket();
  const [message, setMessage] = useState("");
  const [username, setUsername] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleJoin = async () => {
    if (!username.trim() || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      await join(username.trim());
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "join failed");
    } finally {
      setJoining(false);
    }
  };

  const handleSend = () => {
    if (message.trim() && connected) {
      sendMessage(message.trim());
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

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

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
            aria-label="Your name"
          />
          {(joinError || error) && (
            <div className={classes.errorText} role="alert">
              {joinError || error}
            </div>
          )}
          <button
            className={classes.usernameBtn}
            onClick={handleJoin}
            disabled={!username.trim() || joining}
          >
            {joining ? "Joining..." : "Join Chat"}
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

      <div className={classes.messages} role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 ? (
          <div className={classes.emptyState}>
            <div className={classes.emptyIcon}>~</div>
            <div className={classes.emptyText}>No messages yet. Say hello!</div>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.userId === currentUser?.id;
            return (
              <div
                key={msg.messageId}
                className={`${classes.message} ${isOwn ? classes.messageOwn : classes.messageOther}`}
              >
                {!isOwn && <div className={classes.messageUser}>{msg.username || "anon"}</div>}
                {msg.text}
                <div className={classes.messageTime}>{formatTime(msg.createdAt)}</div>
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
            maxLength={2000}
            aria-label="Message"
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
