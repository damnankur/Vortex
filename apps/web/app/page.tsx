"use client";
import { useState, useRef, useEffect } from "react";
import { useSocket, Channel } from "../context/SocketProvider";
import { useVoice } from "../context/VoiceProvider";
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
  const first = names[0] || "";
  const second = names[1] || "";
  if (names.length === 1) return `${first} is transmitting...`;
  if (names.length === 2) return `${first} and ${second} are transmitting...`;
  return `${first} and ${names.length - 1} others are transmitting...`;
}

function serverInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const p0 = parts[0] || "";
  const p1 = parts[1] || "";
  if (parts.length >= 2 && p0 && p1) {
    return (p0.charAt(0) + p1.charAt(0)).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function renderFormattedMessage(text: string, currentUsername?: string) {
  const mentionRegex = /(@[a-zA-Z0-9_-]+)/g;
  const parts = text.split(mentionRegex);

  return parts.map((part, idx) => {
    if (part.startsWith("@") && part.length > 1) {
      const handle = part.slice(1);
      const isSelf = Boolean(
        currentUsername && handle.toLowerCase() === currentUsername.toLowerCase()
      );
      return (
        <span
          key={idx}
          className={classes.mentionPill}
          title={isSelf ? "Mentioned you" : `@${handle}`}
        >
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export default function Page() {
  const {
    login,
    register,
    reset,
    servers,
    activeServer,
    serverMembers,
    switchServer,
    createServer,
    joinServerByCode,
    leaveServer,
    createChannel,
    joinChannelWithCode,
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
    loadingAuth,
    notificationPermission,
    requestNotificationPermission,
  } = useSocket();

  // WebRTC Voice Calling context
  const {
    currentVoiceChannel,
    isInVoice,
    isConnecting: isVoiceConnecting,
    isMuted: isVoiceMuted,
    isDeafened: isVoiceDeafened,
    voiceError,
    voiceParticipants,
    voiceCounts,
    joinVoice,
    leaveVoice,
    toggleMute: toggleVoiceMute,
    toggleDeafen: toggleVoiceDeafen,
  } = useVoice();

  // Chat message & theme state
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth form state
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [serverInviteCode, setServerInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Server creation modal state
  const [showServerModal, setShowServerModal] = useState(false);
  const [serverName, setServerName] = useState("");
  const [serverDesc, setServerDesc] = useState("");
  const [serverSubmitting, setServerSubmitting] = useState(false);
  const [serverModalError, setServerModalError] = useState<string | null>(null);

  // Join server modal state
  const [showJoinServerModal, setShowJoinServerModal] = useState(false);
  const [joinServerInviteCode, setJoinServerInviteCode] = useState("");
  const [joinServerSubmitting, setJoinServerSubmitting] = useState(false);
  const [joinServerModalError, setJoinServerModalError] = useState<string | null>(null);

  // Leave server modal state
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // Invite code copied feedback state
  const [copiedCode, setCopiedCode] = useState(false);

  // Channel creation modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelSlug, setChannelSlug] = useState("");
  const [channelIsPrivate, setChannelIsPrivate] = useState(false);
  const [channelInviteCode, setChannelInviteCode] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Channel unlock modal state
  const [targetUnlockChannel, setTargetUnlockChannel] = useState<Channel | null>(null);
  const [unlockPasskey, setUnlockPasskey] = useState("");
  const [unlockSubmitting, setUnlockSubmitting] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

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

  // Handle Login & Register submission
  const handleAuthSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password || authSubmitting) return;

    setAuthSubmitting(true);
    setAuthError(null);

    try {
      if (authMode === "login") {
        await login(username.trim(), password);
      } else {
        await register(
          username.trim(),
          password,
          serverInviteCode.trim() || undefined
        );
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Handle Server Creation
  const handleCreateServerSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!serverName.trim() || serverSubmitting) return;

    setServerSubmitting(true);
    setServerModalError(null);

    try {
      await createServer(serverName.trim(), serverDesc.trim() || undefined);
      setShowServerModal(false);
      setServerName("");
      setServerDesc("");
    } catch (err) {
      setServerModalError(err instanceof Error ? err.message : "Failed to create server");
    } finally {
      setServerSubmitting(false);
    }
  };

  // Handle Join Server
  const handleJoinServerSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!joinServerInviteCode.trim() || joinServerSubmitting) return;

    setJoinServerSubmitting(true);
    setJoinServerModalError(null);

    try {
      await joinServerByCode(joinServerInviteCode.trim());
      setShowJoinServerModal(false);
      setJoinServerInviteCode("");
    } catch (err) {
      setJoinServerModalError(err instanceof Error ? err.message : "Failed to join server");
    } finally {
      setJoinServerSubmitting(false);
    }
  };

  // Handle Leave / Delete Server
  const handleConfirmLeaveServer = async () => {
    if (!activeServer) return;
    setLeaveSubmitting(true);
    setLeaveError(null);
    try {
      await leaveServer(activeServer.slug);
      setShowLeaveConfirmModal(false);
    } catch (err) {
      setLeaveError(err instanceof Error ? err.message : "Failed to leave server");
    } finally {
      setLeaveSubmitting(false);
    }
  };

  // Handle Channel Creation
  const handleCreateChannelSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!channelName.trim() || createSubmitting) return;

    setCreateSubmitting(true);
    setCreateError(null);

    try {
      const created = await createChannel(
        channelName.trim(),
        channelSlug.trim() || undefined,
        channelIsPrivate,
        channelInviteCode.trim() || undefined
      );
      setShowCreateModal(false);
      setChannelName("");
      setChannelSlug("");
      setChannelIsPrivate(false);
      setChannelInviteCode("");
      switchChannel(created.slug);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create channel");
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Handle Channel Unlock / Code-Join
  const handleUnlockSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!targetUnlockChannel || unlockSubmitting) return;

    setUnlockSubmitting(true);
    setUnlockError(null);

    try {
      await joinChannelWithCode(targetUnlockChannel.slug, unlockPasskey.trim());
      setTargetUnlockChannel(null);
      setUnlockPasskey("");
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "Invalid channel passkey");
    } finally {
      setUnlockSubmitting(false);
    }
  };

  const handleChannelClick = (ch: Channel) => {
    if (ch.isPrivate && !ch.isMember) {
      setTargetUnlockChannel(ch);
      setUnlockPasskey("");
      setUnlockError(null);
    } else {
      switchChannel(ch.slug);
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
      handleSend();
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Brutalist Authentication Screen (Login + Register)
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
              <h1 className={classes.usernameTitle}>VORTEX // PRIVATE</h1>
              <div className={classes.securityBadge}>FRIEND-GROUP AUTHENTICATED GATEWAY</div>
            </div>

            {/* Auth Mode Tabs: Login vs Register */}
            <div className={classes.authTabs}>
              <button
                type="button"
                className={`${classes.authTab} ${authMode === "login" ? classes.authTabActive : ""}`}
                onClick={() => {
                  setAuthMode("login");
                  setAuthError(null);
                }}
              >
                [ LOGIN ]
              </button>
              <button
                type="button"
                className={`${classes.authTab} ${authMode === "register" ? classes.authTabActive : ""}`}
                onClick={() => {
                  setAuthMode("register");
                  setAuthError(null);
                }}
              >
                [ REGISTER ]
              </button>
            </div>

            <form onSubmit={handleAuthSubmit}>
              <label className={classes.inputLabel} htmlFor="operator-handle">
                OPERATOR_HANDLE // [3-20 CHARS]
              </label>
              <input
                id="operator-handle"
                className={classes.usernameInput}
                placeholder="e.g. cyber_operator"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                maxLength={20}
                required
                aria-label="Operator handle"
              />

              <label className={classes.inputLabel} htmlFor="operator-password">
                PASSPHRASE // [MIN 6 CHARS]
              </label>
              <div className={classes.passwordWrapper}>
                <input
                  id="operator-password"
                  type={showPassword ? "text" : "password"}
                  className={classes.usernameInput}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                  aria-label="Passphrase"
                />
                <button
                  type="button"
                  className={classes.passwordToggle}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? "[ HIDE ]" : "[ SHOW ]"}
                </button>
              </div>

              {authMode === "register" && (
                <>
                  <label className={classes.inputLabel} htmlFor="server-invite">
                    SERVER_INVITE_PASSKEY // [FRIEND GROUP CODE]
                  </label>
                  <input
                    id="server-invite"
                    type="text"
                    className={classes.usernameInput}
                    placeholder="Enter friend group code (if required)"
                    value={serverInviteCode}
                    onChange={(e) => setServerInviteCode(e.target.value)}
                    aria-label="Server invite passkey"
                  />
                </>
              )}

              {(authError || error) && (
                <div className={classes.errorBanner} role="alert">
                  <span>[!]</span> {authError || error}
                </div>
              )}

              <button
                type="submit"
                className={classes.usernameBtn}
                disabled={!username.trim() || !password || authSubmitting}
              >
                {authSubmitting
                  ? "[ VERIFYING CREDENTIALS... ]"
                  : authMode === "login"
                  ? "[ INITIALIZE SESSION → ]"
                  : "[ CREATE OPERATOR ID → ]"}
              </button>
            </form>

            <div className={classes.terminalFooter}>
              DATABASE: POSTGRESQL // AUTH: SALTED_SCRYPT // PROTOCOL: WS_V2
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeMinutes = Math.round(onlineUsers.length);
  const currentActiveRoom = channels.find((c) => c.slug === activeChannel);

  return (
    <div className={classes.app} data-theme={theme}>
      {/* ---------- Discord-style Left Server Rail ---------- */}
      <nav className={classes.serverRail} aria-label="Servers">
        {servers.map((srv) => {
          const isActive = activeServer?.slug === srv.slug;
          return (
            <div key={srv.id} className={classes.serverIconWrapper}>
              <div
                className={`${classes.serverPill} ${isActive ? classes.serverPillActive : ""}`}
              />
              <button
                type="button"
                className={`${classes.serverBtn} ${isActive ? classes.serverBtnActive : ""}`}
                onClick={() => switchServer(srv.slug)}
                title={`${srv.name} [CODE: ${srv.inviteCode}]`}
                aria-label={`Server: ${srv.name}`}
              >
                {serverInitials(srv.name)}
              </button>
            </div>
          );
        })}

        <div className={classes.serverDivider} />

        {/* Action: Create Server */}
        <button
          type="button"
          className={classes.serverActionBtn}
          onClick={() => {
            setShowServerModal(true);
            setServerModalError(null);
          }}
          title="Create New Server"
          aria-label="Create New Server"
        >
          +
        </button>

        {/* Action: Join Server with Code */}
        <button
          type="button"
          className={classes.serverActionBtn}
          onClick={() => {
            setShowJoinServerModal(true);
            setJoinServerModalError(null);
          }}
          title="Join Server with Invite Code"
          aria-label="Join Server with Invite Code"
        >
          🧭
        </button>
      </nav>

      {/* ---------- Channels Sidebar ---------- */}
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

        {/* Active Server Info & Invite Badge */}
        {activeServer && (
          <div className={classes.serverMetaBar}>
            <div className={classes.serverMetaHeader}>
              <div className={classes.serverMetaName} title={activeServer.name}>
                {activeServer.name}
              </div>
              <button
                type="button"
                className={classes.serverCreateMiniBtn}
                onClick={() => {
                  setShowServerModal(true);
                  setServerModalError(null);
                }}
                title="Create a new server realm"
                aria-label="Create server"
              >
                + SERVER
              </button>
            </div>
            <div className={classes.serverMetaActionsRow}>
              <button
                type="button"
                className={classes.serverInviteBtn}
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    navigator.clipboard.writeText(activeServer.inviteCode);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }
                }}
                title="Click to copy server invite code"
              >
                <span>INVITE: {activeServer.inviteCode}</span>
                <span>{copiedCode ? "✓" : "📋"}</span>
              </button>
              {activeServer.slug !== "vortex-main" && (
                <button
                  type="button"
                  className={classes.serverLeaveBtn}
                  onClick={() => {
                    setLeaveError(null);
                    setShowLeaveConfirmModal(true);
                  }}
                  title={activeServer.isOwner ? "Delete this server" : "Leave this server"}
                  aria-label={activeServer.isOwner ? "Delete server" : "Leave server"}
                >
                  {activeServer.isOwner ? "⏻ DELETE" : "⏻ LEAVE"}
                </button>
              )}
            </div>
          </div>
        )}

        <div className={classes.channelGroup}>
          <div className={classes.channelGroupHeader}>
            <div className={classes.channelGroupLabel}>[ TEXT CHANNELS ]</div>
            <button
              type="button"
              className={classes.addChannelBtn}
              onClick={() => {
                setShowCreateModal(true);
                setCreateError(null);
              }}
              title="Create new channel in active server"
              aria-label="Create new channel"
            >
              [+]
            </button>
          </div>

          {channels.map((ch) => {
            const active = ch.slug === activeChannel;
            const isLocked = ch.isPrivate && !ch.isMember;

            return (
              <button
                key={ch.slug}
                className={`${classes.channel} ${active ? classes.channelActive : ""}`}
                onClick={() => handleChannelClick(ch)}
                aria-current={active ? "true" : undefined}
              >
                <span className={classes.channelHash}>#</span>
                <span className={classes.channelName}>{ch.name}</span>
                {ch.isPrivate && (
                  <span
                    className={classes.channelLockIcon}
                    title={isLocked ? "Code-protected channel (click to unlock)" : "Private channel (unlocked)"}
                  >
                    {isLocked ? "🔒" : "🔓"}
                  </span>
                )}
                {(voiceCounts[ch.slug] || 0) > 0 && (
                  <span
                    className={classes.channelVoiceBadge}
                    title={`${voiceCounts[ch.slug]} operator(s) in voice`}
                  >
                    🎙 {voiceCounts[ch.slug]}
                  </span>
                )}
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

      {/* ---------- Main Chat Area ---------- */}
      <main className={classes.chat}>
        <header className={classes.chatHeader}>
          <div className={classes.chatHeaderMain}>
            <div className={classes.chatTitle}>
              <span className={classes.channelHash}>#</span>
              {channelTitle(activeChannel)}
              {currentActiveRoom?.isPrivate && (
                <span style={{ fontSize: "14px", marginLeft: "4px" }}>🔒</span>
              )}
            </div>
            <div className={classes.chatTopic}>
              [{activeMinutes} {activeMinutes === 1 ? "OPERATOR" : "OPERATORS"} ONLINE]
            </div>
          </div>
          <div className={classes.chatHeaderControls}>
            {isInVoice && currentVoiceChannel === activeChannel ? (
              <button
                type="button"
                className={classes.voiceHeaderConnectedBtn}
                onClick={leaveVoice}
                title="Connected to voice in this channel. Click to disconnect."
              >
                🟢 [ VOICE: ACTIVE ]
              </button>
            ) : (
              <button
                type="button"
                className={classes.voiceHeaderBtn}
                onClick={() => joinVoice(activeChannel)}
                disabled={isVoiceConnecting}
                title={
                  (voiceCounts[activeChannel] || 0) > 0
                    ? `${voiceCounts[activeChannel]} operators in voice in #${activeChannel}`
                    : `Start or join voice call in #${activeChannel}`
                }
              >
                🎙 {isVoiceConnecting ? "CONNECTING..." : (voiceCounts[activeChannel] || 0) > 0 ? `JOIN VOICE (${voiceCounts[activeChannel]})` : "JOIN VOICE"}
              </button>
            )}
            <button
              type="button"
              className={`${classes.notifyToggleBtn} ${
                notificationPermission === "granted" ? classes.notifyActive : ""
              }`}
              onClick={requestNotificationPermission}
              title={
                notificationPermission === "granted"
                  ? "Desktop background notifications are active"
                  : "Click to enable background desktop notifications"
              }
            >
              🔔 {notificationPermission === "granted" ? "NOTIFS: ON" : "ENABLE NOTIFS"}
            </button>
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

        {/* Active Voice Dock */}
        {isInVoice && (
          <div className={classes.voiceDock}>
            <div className={classes.voiceDockHeader}>
              <div className={classes.voiceDockInfo}>
                <span className={classes.voiceLiveDot} />
                <span className={classes.voiceDockTitle}>
                  SYS://VOICE_MESH // #{currentVoiceChannel?.toUpperCase()}
                </span>
                <span className={classes.voiceDockCount}>
                  [{voiceParticipants.length} {voiceParticipants.length === 1 ? "OPERATOR" : "OPERATORS"}]
                </span>
              </div>
              <div className={classes.voiceDockControls}>
                <button
                  type="button"
                  className={`${classes.voiceControlBtn} ${
                    isVoiceMuted ? classes.voiceControlMuted : ""
                  }`}
                  onClick={toggleVoiceMute}
                  title={isVoiceMuted ? "Unmute microphone" : "Mute microphone"}
                >
                  {isVoiceMuted ? "🎙 MUTED" : "🎙 MUTE"}
                </button>
                <button
                  type="button"
                  className={`${classes.voiceControlBtn} ${
                    isVoiceDeafened ? classes.voiceControlDeafened : ""
                  }`}
                  onClick={toggleVoiceDeafen}
                  title={isVoiceDeafened ? "Undeafen audio" : "Deafen all audio"}
                >
                  {isVoiceDeafened ? "🎧 DEAFENED" : "🎧 DEAFEN"}
                </button>
                <button
                  type="button"
                  className={classes.voiceDisconnectBtn}
                  onClick={leaveVoice}
                  title="Disconnect from voice channel"
                >
                  [ ⏻ LEAVE ]
                </button>
              </div>
            </div>

            {voiceError && (
              <div className={classes.voiceDockError}>
                <span>[!]</span> {voiceError}
              </div>
            )}

            <div className={classes.voiceParticipantsList}>
              {voiceParticipants.map((participant) => (
                <div
                  key={participant.socketId || participant.userId}
                  className={`${classes.voiceParticipantCard} ${
                    participant.isSpeaking ? classes.voiceSpeaking : ""
                  }`}
                >
                  <div
                    className={classes.voiceParticipantAvatar}
                    style={avatarStyle(participant.username)}
                  >
                    {participant.username.charAt(0).toUpperCase()}
                    {participant.isSpeaking && <span className={classes.voiceHaloRing} />}
                  </div>
                  <div className={classes.voiceParticipantMeta}>
                    <span className={classes.voiceParticipantName}>
                      {participant.username}
                      {participant.isSelf ? " (YOU)" : ""}
                    </span>
                    {participant.isMuted && (
                      <span className={classes.voiceMutedBadge}>MUTED</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
              const myUsername = currentUser?.username?.toLowerCase();
              const isMentioned = Boolean(
                myUsername && msg.text.toLowerCase().includes(`@${myUsername}`)
              );

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
                  <div
                    className={`${classes.messageCard} ${isOwn ? classes.messageCardOwn : ""} ${
                      isMentioned ? classes.messageCardMentioned : ""
                    }`}
                  >
                    <div className={classes.messageHeader}>
                      <span className={classes.messageUser}>{name}</span>
                      {isOwn && <span className={classes.messageTag}>YOU</span>}
                      {isMentioned && (
                        <span className={classes.mentionBadge} title="You were mentioned in this transmission">
                          @MENTIONED
                        </span>
                      )}
                      <span className={classes.messageTime}>[{formatTime(msg.createdAt)}]</span>
                    </div>
                    <div className={classes.messageText}>
                      {renderFormattedMessage(msg.text, currentUser?.username)}
                    </div>
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

      {/* ---------- Right Sidebar (Members Directory) ---------- */}
      <aside className={classes.members} aria-label="Members">
        <div className={classes.membersHeader}>[ DIRECTORY // {onlineUsers.length} ONLINE ]</div>
        <div className={classes.membersSection}>
          {activeServer ? `[ ${activeServer.name.toUpperCase()} ]` : "[ ACTIVE OPERATORS ]"}
        </div>
        {onlineUsers.length === 0 ? (
          <div className={classes.membersEmpty}>NO OPERATORS DETECTED.</div>
        ) : (
          onlineUsers.map((user) => {
            const memberInfo = serverMembers.find((m) => m.userId === user.userId);
            const isOwner =
              memberInfo?.role === "OWNER" ||
              (user.userId === currentUser?.id && Boolean(activeServer?.isOwner));
            const isBot = memberInfo?.role === "BOT";
            return (
              <div key={user.userId} className={classes.member}>
                <span className={classes.memberSquare} />
                <span className={classes.memberName}>
                  {user.username}
                  {user.userId === currentUser?.id ? " (YOU)" : ""}
                </span>
                {isOwner && (
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: 900,
                      padding: "1px 4px",
                      background: "#FFE600",
                      color: "#000000",
                      border: "1px solid #000000",
                      marginLeft: "auto",
                      boxShadow: "1px 1px 0px #000000",
                    }}
                  >
                    OWNER
                  </span>
                )}
                {isBot && (
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: 800,
                      padding: "1px 4px",
                      background: "var(--bg-secondary)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border-color)",
                      marginLeft: "auto",
                    }}
                  >
                    BOT
                  </span>
                )}
              </div>
            );
          })
        )}
      </aside>

      {/* ---------- Modal: Create Dynamic Channel ---------- */}
      {showCreateModal && (
        <div className={classes.modalOverlay} role="dialog" aria-modal="true">
          <div className={classes.modalWindow}>
            <div className={classes.windowTitleBar}>
              <div className={classes.windowTitle}>
                <span className={classes.windowPrompt}>&gt;_</span> SYS://CHANNEL_CREATOR
              </div>
              <div className={classes.windowControls}>
                <button
                  type="button"
                  className={`${classes.windowBtn} ${classes.windowBtnClose}`}
                  onClick={() => setShowCreateModal(false)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={classes.modalBody}>
              <form onSubmit={handleCreateChannelSubmit}>
                <label className={classes.inputLabel} htmlFor="new-channel-name">
                  CHANNEL_NAME // [REQUIRED]
                </label>
                <input
                  id="new-channel-name"
                  className={classes.usernameInput}
                  placeholder="e.g. gaming-hub"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  maxLength={50}
                  required
                  autoFocus
                />

                <label className={classes.inputLabel} htmlFor="new-channel-slug">
                  CHANNEL_SLUG // [OPTIONAL IDENTIFIER]
                </label>
                <input
                  id="new-channel-slug"
                  className={classes.usernameInput}
                  placeholder="Auto-generated if left blank"
                  value={channelSlug}
                  onChange={(e) => setChannelSlug(e.target.value)}
                  maxLength={50}
                />

                <label className={classes.inputLabel}>
                  ACCESS_POLICY //
                </label>
                <div className={classes.typeSelector}>
                  <button
                    type="button"
                    className={`${classes.typeBtn} ${!channelIsPrivate ? classes.typeBtnActive : ""}`}
                    onClick={() => setChannelIsPrivate(false)}
                  >
                    [ PUBLIC CHANNEL ]
                  </button>
                  <button
                    type="button"
                    className={`${classes.typeBtn} ${channelIsPrivate ? classes.typeBtnActive : ""}`}
                    onClick={() => setChannelIsPrivate(true)}
                  >
                    [ 🔒 CODE-PROTECTED ]
                  </button>
                </div>

                {channelIsPrivate && (
                  <>
                    <label className={classes.inputLabel} htmlFor="channel-invite-code">
                      CHANNEL_INVITE_PASSKEY // [SHARE WITH INVITED FRIENDS]
                    </label>
                    <input
                      id="channel-invite-code"
                      className={classes.usernameInput}
                      placeholder="e.g. secret_gamers_2026"
                      value={channelInviteCode}
                      onChange={(e) => setChannelInviteCode(e.target.value)}
                      maxLength={50}
                      required={channelIsPrivate}
                    />
                  </>
                )}

                {createError && (
                  <div className={classes.errorBanner} role="alert">
                    <span>[!]</span> {createError}
                  </div>
                )}

                <div className={classes.channelModalBtns}>
                  <button
                    type="button"
                    className={classes.cancelBtn}
                    onClick={() => setShowCreateModal(false)}
                  >
                    [ CANCEL ]
                  </button>
                  <button
                    type="submit"
                    className={classes.confirmBtn}
                    disabled={!channelName.trim() || createSubmitting}
                  >
                    {createSubmitting ? "[ CREATING... ]" : "[ INITIALIZE CHANNEL ↵ ]"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal: Unlock Code-Protected Channel ---------- */}
      {targetUnlockChannel && (
        <div className={classes.modalOverlay} role="dialog" aria-modal="true">
          <div className={classes.modalWindow}>
            <div className={classes.windowTitleBar}>
              <div className={classes.windowTitle}>
                <span className={classes.windowPrompt}>&gt;_</span> SYS://ACCESS_VERIFICATION
              </div>
              <div className={classes.windowControls}>
                <button
                  type="button"
                  className={`${classes.windowBtn} ${classes.windowBtnClose}`}
                  onClick={() => setTargetUnlockChannel(null)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={classes.modalBody}>
              <div className={classes.modalPrompt}>
                CHANNEL <strong>#{targetUnlockChannel.name}</strong> IS RESTRICTED.
                <br />
                ENTER THE CHANNEL PASSKEY TO GAIN PERMANENT ACCESS.
              </div>

              <form onSubmit={handleUnlockSubmit}>
                <label className={classes.inputLabel} htmlFor="unlock-passkey">
                  CHANNEL_PASSKEY //
                </label>
                <input
                  id="unlock-passkey"
                  type="password"
                  className={classes.usernameInput}
                  placeholder="Enter invite passkey..."
                  value={unlockPasskey}
                  onChange={(e) => setUnlockPasskey(e.target.value)}
                  autoFocus
                  required
                />

                {unlockError && (
                  <div className={classes.errorBanner} role="alert">
                    <span>[!]</span> {unlockError}
                  </div>
                )}

                <div className={classes.channelModalBtns}>
                  <button
                    type="button"
                    className={classes.cancelBtn}
                    onClick={() => setTargetUnlockChannel(null)}
                  >
                    [ CANCEL ]
                  </button>
                  <button
                    type="submit"
                    className={classes.confirmBtn}
                    disabled={!unlockPasskey.trim() || unlockSubmitting}
                  >
                    {unlockSubmitting ? "[ VERIFYING... ]" : "[ UNLOCK & ENTER → ]"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal: Create Server ---------- */}
      {showServerModal && (
        <div className={classes.modalOverlay} role="dialog" aria-modal="true">
          <div className={classes.modalWindow}>
            <div className={classes.windowTitleBar}>
              <div className={classes.windowTitle}>
                <span className={classes.windowPrompt}>&gt;_</span> SYS://SERVER_CREATOR
              </div>
              <div className={classes.windowControls}>
                <button
                  type="button"
                  className={`${classes.windowBtn} ${classes.windowBtnClose}`}
                  onClick={() => setShowServerModal(false)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={classes.modalBody}>
              <div className={classes.modalPrompt}>
                INITIALIZE A NEW DISCORD-STYLE SERVER REALM.
                <br />
                CREATE CHANNELS &amp; INVITE YOUR FRIENDS VIA YOUR PRIVATE INVITE CODE.
              </div>

              <form onSubmit={handleCreateServerSubmit}>
                <label className={classes.inputLabel} htmlFor="new-server-name">
                  SERVER_NAME // [1-50 CHARS, REQUIRED]
                </label>
                <input
                  id="new-server-name"
                  className={classes.usernameInput}
                  placeholder="e.g. Cyber Bunker, SquadHQ"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  maxLength={50}
                  required
                  autoFocus
                />

                <label className={classes.inputLabel} htmlFor="new-server-desc">
                  DESCRIPTION // [OPTIONAL]
                </label>
                <input
                  id="new-server-desc"
                  className={classes.usernameInput}
                  placeholder="e.g. Private hangout for gaming and banter"
                  value={serverDesc}
                  onChange={(e) => setServerDesc(e.target.value)}
                  maxLength={255}
                />

                {serverModalError && (
                  <div className={classes.errorBanner} role="alert">
                    <span>[!]</span> {serverModalError}
                  </div>
                )}

                <div className={classes.channelModalBtns}>
                  <button
                    type="button"
                    className={classes.cancelBtn}
                    onClick={() => setShowServerModal(false)}
                  >
                    [ CANCEL ]
                  </button>
                  <button
                    type="submit"
                    className={classes.confirmBtn}
                    disabled={!serverName.trim() || serverSubmitting}
                  >
                    {serverSubmitting ? "[ INITIALIZING... ]" : "[ CREATE SERVER ↵ ]"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal: Join Server with Invite Code ---------- */}
      {showJoinServerModal && (
        <div className={classes.modalOverlay} role="dialog" aria-modal="true">
          <div className={classes.modalWindow}>
            <div className={classes.windowTitleBar}>
              <div className={classes.windowTitle}>
                <span className={classes.windowPrompt}>&gt;_</span> SYS://JOIN_SERVER
              </div>
              <div className={classes.windowControls}>
                <button
                  type="button"
                  className={`${classes.windowBtn} ${classes.windowBtnClose}`}
                  onClick={() => setShowJoinServerModal(false)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={classes.modalBody}>
              <div className={classes.modalPrompt}>
                JOIN AN EXISTING SERVER HUB.
                <br />
                ENTER THE UNIQUE INVITE CODE SUPPLIED BY A SERVER OPERATOR.
              </div>

              <form onSubmit={handleJoinServerSubmit}>
                <label className={classes.inputLabel} htmlFor="join-server-code">
                  SERVER_INVITE_CODE // [E.G. VX-XXXX OR VORTEX-MAIN]
                </label>
                <input
                  id="join-server-code"
                  className={classes.usernameInput}
                  placeholder="e.g. VX-9K2L"
                  value={joinServerInviteCode}
                  onChange={(e) => setJoinServerInviteCode(e.target.value.toUpperCase())}
                  maxLength={30}
                  required
                  autoFocus
                />

                {joinServerModalError && (
                  <div className={classes.errorBanner} role="alert">
                    <span>[!]</span> {joinServerModalError}
                  </div>
                )}

                <div className={classes.channelModalBtns}>
                  <button
                    type="button"
                    className={classes.cancelBtn}
                    onClick={() => setShowJoinServerModal(false)}
                  >
                    [ CANCEL ]
                  </button>
                  <button
                    type="submit"
                    className={classes.confirmBtn}
                    disabled={!joinServerInviteCode.trim() || joinServerSubmitting}
                  >
                    {joinServerSubmitting ? "[ CONNECTING... ]" : "[ JOIN REALM ↵ ]"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal: Confirm Leave / Delete Server ---------- */}
      {showLeaveConfirmModal && activeServer && (
        <div className={classes.modalOverlay} role="dialog" aria-modal="true">
          <div className={classes.modalWindow}>
            <div className={classes.windowTitleBar}>
              <div className={classes.windowTitle}>
                <span className={classes.windowPrompt}>&gt;_</span> SYS://
                {activeServer.isOwner ? "DELETE_SERVER" : "LEAVE_SERVER"}
              </div>
              <div className={classes.windowControls}>
                <button
                  type="button"
                  className={`${classes.windowBtn} ${classes.windowBtnClose}`}
                  onClick={() => setShowLeaveConfirmModal(false)}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={classes.modalBody}>
              <div className={classes.modalPrompt}>
                <span style={{ color: "var(--text-primary)", fontWeight: 800 }}>
                  {activeServer.isOwner
                    ? `CONFIRM PERMANENT TERMINATION OF [${activeServer.name.toUpperCase()}]?`
                    : `CONFIRM DEPARTURE FROM [${activeServer.name.toUpperCase()}]?`}
                </span>
                <br />
                <br />
                {activeServer.isOwner
                  ? "WARNING: YOU ARE THE REALM OWNER. TERMINATING THIS SERVER WILL PURGE ALL CHANNELS, MEMBERSHIPS, AND DISCUSSIONS. YOU WILL BE REROUTED TO VORTEX // MAIN."
                  : "YOU WILL BE DISCONNECTED FROM ALL ITS CHANNELS AND CEASE TO RECEIVE DISPATCHES UNTIL RE-INVITED. YOU WILL BE SAFELY RETURNED TO VORTEX // MAIN."}
              </div>

              {leaveError && (
                <div className={classes.errorBanner} role="alert">
                  <span>[!]</span> {leaveError}
                </div>
              )}

              <div className={classes.channelModalBtns}>
                <button
                  type="button"
                  className={classes.cancelBtn}
                  onClick={() => setShowLeaveConfirmModal(false)}
                >
                  [ CANCEL ]
                </button>
                <button
                  type="button"
                  className={classes.serverDangerConfirmBtn}
                  onClick={handleConfirmLeaveServer}
                  disabled={leaveSubmitting}
                >
                  {leaveSubmitting
                    ? "[ COMMITTING... ]"
                    : activeServer.isOwner
                    ? "[ ⏻ TERMINATE SERVER ]"
                    : "[ ⏻ LEAVE SERVER ]"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}