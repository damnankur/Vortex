"use client";
import { useState, useRef, useEffect } from "react";
import { useSocket } from "../context/SocketProvider";
import classes from "./page.module.css";

const BRUTAL_AVATAR_COLORS = [
  "#FFE600", // Yellow
  "#00E5FF", // Cyan
  "#00F0A0", // Mint
  "#FF5376", // Coral
  "#A78BFA", // Lavender
  "#FF9F1C", // Orange
  "#38BDF8", // Sky
  "#F472B6", // Pink
];

function avatarStyle(name: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const color = BRUTAL_AVATAR_COLORS[Math.abs(hash) % BRUTAL_AVATAR_COLORS.length];
  return { background: color, color: "#000000" };
}

function channelTitle(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function typingLabel(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is transmitting...`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are transmitting...`;
  return `${names[0]} and ${names.length - 1} others are transmitting...`;
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
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("vortex_theme") as "dark" | "light" | null;
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("vortex_theme", next);
  };

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
      <div className={classes.usernameModal} data-theme={theme}>
        <div className={classes.windowFrame}>
          <div className={classes.windowTitleBar}>
            <div className={classes.windowTitle}>
              <span className={classes.windowPrompt}>&gt;_</span> SYS://AUTH_GATEWAY
            </div>
            <div className={classes.windowControls}>
              <button
                type="button"
                className={classes.windowBtn}
                onClick={toggleTheme}
                title="Toggle Theme"
                style={{ cursor: "pointer", width: "auto", padding: "0 6px" }}
              >
                {theme === "dark" ? "☀ LIGHT" : "☾ DARK"}
              </button>
              <span className={classes.windowBtn} aria-hidden="true">—</span>
              <span className={classes.windowBtn} aria-hidden="true">□</span>
              <span className={`${classes.windowBtn} ${classes.windowBtnClose}`} aria-hidden="true">✕</span>
            </div>
          </div>

          <div className={classes.usernameCard}>
            <div className={classes.usernameBrand}>
              <div className={classes.logoContainer}>
                <img
                  src="/vortex-logo.png"
                  alt="Vortex logo"
                  width={52}
                  height={52}
                  className={classes.usernameLogo}
                />
              </div>
              <h1 className={classes.usernameTitle}>VORTEX // CHAT</h1>
              <div className={classes.securityBadge}>IDENTITY VERIFICATION REQUIRED</div>
              <p className={classes.usernameSub}>ASSIGN OPERATOR HANDLE TO INITIALIZE SESSION</p>
            </div>

            <label className={classes.inputLabel} htmlFor="operator-handle">
              OPERATOR_HANDLE // [MAX 20 CHARS]
            </label>
            <input
              id="operator-handle"
              className={classes.usernameInput}
              placeholder="e.g. cyber_operator"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              maxLength={20}
              aria-label="Operator handle"
            />

            {(joinError || error) && (
              <div className={classes.errorBanner} role="alert">
                <span>[!]</span> {joinError || error}
              </div>
            )}

            <button
              className={classes.usernameBtn}
              onClick={handleJoin}
              disabled={!username.trim() || joining}
            >
              {joining ? "[ INITIALIZING SESSION... ]" : "[ ENTER SERVER → ]"}
            </button>

            <div className={classes.terminalFooter}>
              REDIS_PUBSUB: ACTIVE // KAFKA_STREAM: ONLINE // PROTOCOL: WS_V2
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeMinutes = Math.round(onlineUsers.length);

  return (
    <div className={classes.app} data-theme={theme}>
      <aside className={classes.sidebar} aria-label="Channels">
        <div className={classes.brand}>
          <div className={classes.brandLeft}>
            <img
              src="/vortex-logo.png"
              alt="Vortex logo"
              width={34}
              height={34}
              className={classes.brandLogo}
            />
            <span>VORTEX</span>
          </div>
          <div className={classes.brandBadge}>v1.0</div>
        </div>

        <div className={classes.channelGroup}>
          <div className={classes.channelGroupLabel}>[ TEXT CHANNELS ]</div>
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
              ONLINE
            </div>
          </div>
          <button className={classes.userSwitch} onClick={reset} aria-label="Log out">
            [ LOGOUT ]
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
              [{activeMinutes} {activeMinutes === 1 ? "OPERATOR" : "OPERATORS"} ONLINE]
            </div>
          </div>
          <div className={classes.chatHeaderControls}>
            <button
              className={classes.themeToggleBtn}
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title="Toggle theme"
            >
              {theme === "dark" ? "☀ LIGHT" : "☾ DARK"}
            </button>
            <div className={classes.status}>
              <div className={`${classes.dot} ${connected ? classes.dotOnline : ""}`} />
              {connected ? "CONNECTED // LIVE" : "DISCONNECTED // RETRYING"}
            </div>
          </div>
        </header>

        <div className={classes.messages} role="log" aria-live="polite" aria-label="Chat messages">
          {messages.length === 0 ? (
            <div className={classes.emptyState}>
              <div className={classes.emptyBox}>
                <div className={classes.emptyIcon}>#</div>
                <div className={classes.emptyTitle}>NO TRANSMISSIONS LOGGED</div>
                <div className={classes.emptyText}>
                  Be the first operator to broadcast a message in #{activeChannel}.
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.userId === currentUser?.id;
              const name = msg.username || "anon";
              return (
                <div
                  key={msg.messageId}
                  className={`${classes.messageRow} ${isOwn ? classes.messageRowOwn : ""}`}
                >
                  <div
                    className={classes.messageAvatar}
                    style={avatarStyle(name)}
                    aria-hidden="true"
                  >
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className={`${classes.messageCard} ${isOwn ? classes.messageCardOwn : ""}`}>
                    <div className={classes.messageHeader}>
                      <span className={classes.messageUser}>{name}</span>
                      {isOwn && <span className={classes.messageTag}>YOU</span>}
                      <span className={classes.messageTime}>[{formatTime(msg.createdAt)}]</span>
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
            <span>&gt;</span> {typingLabel(typingUsers)} <span className={classes.typingCursor} />
          </div>
        )}

        <div className={classes.inputArea}>
          <div className={classes.inputRow}>
            <input
              className={classes.input}
              placeholder={connected ? `[ BROADCAST TO #${activeChannel.toUpperCase()}... ]` : "[ SYSTEM OFFLINE - RECONNECTING... ]"}
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
              [ TRANSMIT ↵ ]
            </button>
          </div>
        </div>
      </main>

      <aside className={classes.members} aria-label="Members">
        <div className={classes.membersHeader}>[ DIRECTORY // {onlineUsers.length} ONLINE ]</div>
        <div className={classes.membersSection}>[ ACTIVE OPERATORS ]</div>
        {onlineUsers.length === 0 ? (
          <div className={classes.membersEmpty}>NO OTHER OPERATORS DETECTED.</div>
        ) : (
          onlineUsers.map((user) => (
            <div key={user.userId} className={classes.member}>
              <span className={classes.memberSquare} />
              <span className={classes.memberName}>{user.username}</span>
            </div>
          ))
        )}
      </aside>
    </div>
  );
}