"use client";
import { useState, useRef, useEffect } from "react";
import { useSocket } from "../context/SocketProvider";
import classes from "./page.module.css";

function avatarStyle(name: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return { background: `hsl(${hue}, 60%, 45%)` };
}

function channelTitle(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function typingLabel(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing...`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
  return `${names[0]} and ${names.length - 1} others are typing...`;
}

export default function Page() {
  const {
    join,
    reset,
    sendMessage,
    emitTyping,
    switchChannel,
    messages,
    channels,
    activeChannel,
    onlineUsers,
    typingUsers,
    connected,
    joined,
    currentUser,
    error,
  } = useSocket();
  const [message, setMessage] = useState("");
  const [username, setUsername] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeChannel]);

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
      emitTyping(false);
    }
  };

  const handleInputChange = (value: string) => {
    setMessage(value);
    emitTyping(value.trim().length > 0);
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
          <div className={classes.usernameTitle}>
            <img
              src="/vortex-logo.png"
              alt="Vortex logo"
              width={56}
              height={56}
              className={classes.usernameLogo}
            />
            Vortex
          </div>
          <div className={classes.usernameSub}>Enter a name to join the server</div>
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

  const activeMinutes = Math.round(onlineUsers.length);

  return (
    <div className={classes.app}>
      <aside className={classes.sidebar} aria-label="Channels">
        <div className={classes.brand}>
          <img
            src="/vortex-logo.png"
            alt="Vortex logo"
            width={36}
            height={36}
            className={classes.brandLogo}
          />
          VORTEX
        </div>

        <div className={classes.channelGroup}>
          <div className={classes.channelGroupLabel}>TEXT CHANNELS</div>
          {channels.map((ch) => {
            const active = ch.slug === activeChannel;
            return (
              <button
                key={ch.slug}
                className={`${classes.channel} ${active ? classes.channelActive : ""}`}
                onClick={() => switchChannel(ch.slug)}
                aria-current={active ? "true" : undefined}
              >
                <span className={classes.channelHash}>#</span>
                <span className={classes.channelName}>{ch.name}</span>
              </button>
            );
          })}
        </div>

        <div className={classes.userPanel}>
          <div className={classes.userAvatar} style={avatarStyle(currentUser?.username || "?")}>
            {(currentUser?.username || "?").charAt(0).toUpperCase()}
          </div>
          <div className={classes.userMeta}>
            <div className={classes.userName}>{currentUser?.username}</div>
            <div className={classes.userStatus}>
              <span className={classes.onlineDot} />
              Online
            </div>
          </div>
          <button className={classes.userSwitch} onClick={reset} aria-label="Log out">
            Log out
          </button>
        </div>
      </aside>

      <main className={classes.chat}>
        <header className={classes.chatHeader}>
          <div className={classes.chatHeaderMain}>
            <div className={classes.chatTitle}>
              <span className={classes.channelHash}>#</span>
              {channelTitle(activeChannel)}
            </div>
            <div className={classes.chatTopic}>
              {activeMinutes} {activeMinutes === 1 ? "member" : "members"} in this channel
            </div>
          </div>
          <div className={classes.status}>
            <div className={`${classes.dot} ${connected ? classes.dotOnline : ""}`} />
            {connected ? "Connected" : "Reconnecting..."}
          </div>
        </header>

        <div className={classes.messages} role="log" aria-live="polite" aria-label="Chat messages">
          {messages.length === 0 ? (
            <div className={classes.emptyState}>
              <div className={classes.emptyIcon}>#</div>
              <div className={classes.emptyText}>
                No messages here yet. Say hello in #{activeChannel}!
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.userId === currentUser?.id;
              const name = msg.username || "anon";
              return (
                <div
                  key={msg.messageId}
                  className={`${classes.messageRow} ${isOwn ? classes.messageOwn : ""}`}
                >
                  <div
                    className={classes.messageAvatar}
                    style={avatarStyle(name)}
                    aria-hidden="true"
                  >
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className={classes.messageBody}>
                    <div className={classes.messageHeader}>
                      <span
                        className={`${classes.messageUser} ${isOwn ? classes.messageUserOwn : ""}`}
                      >
                        {name}
                      </span>
                      <span className={classes.messageTime}>{formatTime(msg.createdAt)}</span>
                    </div>
                    <div className={classes.messageText}>{msg.text}</div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {typingUsers.length > 0 && (
          <div className={classes.typing} aria-live="polite">
            {typingLabel(typingUsers)}
          </div>
        )}

        <div className={classes.inputArea}>
          <div className={classes.inputRow}>
            <input
              className={classes.input}
              placeholder={connected ? `Message #${activeChannel}` : "Waiting for connection..."}
              value={message}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => emitTyping(false)}
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
      </main>

      <aside className={classes.members} aria-label="Members">
        <div className={classes.membersHeader}>Members — {onlineUsers.length}</div>
        <div className={classes.membersSection}>ONLINE</div>
        {onlineUsers.length === 0 ? (
          <div className={classes.membersEmpty}>No one else is here right now.</div>
        ) : (
          onlineUsers.map((user) => (
            <div key={user.userId} className={classes.member}>
              <span className={classes.memberDot} />
              <span className={classes.memberName}>{user.username}</span>
            </div>
          ))
        )}
      </aside>
    </div>
  );
}