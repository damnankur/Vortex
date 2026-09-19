"use client";
import React, { useEffect, useRef, useState } from "react";
import { useSocket } from "../context/SocketProvider";
import { useVoice } from "../context/VoiceProvider";
import type { Channel } from "../types/server";
import { AuthGateway } from "../components/auth/AuthGateway";
import { ServerRail } from "../components/servers/ServerRail";
import { ChannelSidebar } from "../components/channels/ChannelSidebar";
import { ChatArea } from "../components/chat/ChatArea";
import { ActiveOperatorsSidebar } from "../components/directory/ActiveOperatorsSidebar";
import { CreateServerModal } from "../components/modals/CreateServerModal";
import { JoinServerModal } from "../components/modals/JoinServerModal";
import { LeaveConfirmModal } from "../components/modals/LeaveConfirmModal";
import { CreateChannelModal } from "../components/modals/CreateChannelModal";
import { UnlockChannelModal } from "../components/modals/UnlockChannelModal";
import classes from "./page.module.css";

export default function Home() {
  const {
    connected,
    joined,
    currentUser,
    reset,
    login,
    register,
    servers,
    activeServer,
    switchServer,
    createServer,
    joinServerByCode,
    leaveServer,
    channels,
    activeChannel,
    switchChannel,
    prefetchChannel,
    createChannel,
    joinChannelWithCode,
    channelLoading,
    messages,
    sendMessage,
    emitTyping,
    typingUsers,
    serverMembers,
    serverOnlineUsers,
  } = useSocket();

  const {
    isInVoice,
    currentVoiceChannel,
    voiceParticipants,
    voiceStates,
    joinVoice,
    leaveVoice,
  } = useVoice();

  const [text, setText] = useState("");
  const [showServerModal, setShowServerModal] = useState(false);
  const [showJoinServerModal, setShowJoinServerModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [targetUnlockChannel, setTargetUnlockChannel] = useState<Channel | null>(null);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem("vortex_theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
    }

    const savedSound = localStorage.getItem("vortex_sound_enabled");
    if (savedSound !== null) {
      setSoundEnabled(savedSound !== "false");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("vortex_theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("vortex_sound_enabled", String(next));
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeChannel]);

  const activeChannelObj = channels.find((c) => c.slug === activeChannel) || null;

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage(text);
    setText("");
    emitTyping(false);
    inputRef.current?.focus();
  };

  const toggleChannelVoice = (channelSlug: string) => {
    if (isInVoice && currentVoiceChannel === channelSlug) {
      leaveVoice();
    } else {
      joinVoice(channelSlug);
    }
  };

  if (!joined) {
    return (
      <AuthGateway
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogin={login}
        onRegister={register}
      />
    );
  }

  return (
    <div className={classes.app} data-theme={theme}>
      <ServerRail
        servers={servers}
        activeServer={activeServer}
        onSwitchServer={(slug: string) => switchServer(slug)}
        onOpenCreateModal={() => setShowServerModal(true)}
        onOpenJoinModal={() => setShowJoinServerModal(true)}
        onManageServer={() => {}}
      />

      <ChannelSidebar
        currentUser={currentUser}
        activeServer={activeServer}
        channels={channels}
        activeChannel={activeChannel}
        voiceCounts={{}}
        voiceStates={voiceStates}
        onSwitchChannel={(channel: Channel) => switchChannel(channel.slug)}
        onPrefetchChannel={(slug: string) => prefetchChannel(slug)}
        onOpenCreateChannel={() => setShowCreateModal(true)}
        onOpenCreateServer={() => setShowServerModal(true)}
        onOpenJoinServer={() => setShowJoinServerModal(true)}
        onLeaveServer={() => setShowLeaveModal(true)}
        onResetUser={reset}
      />

      <ChatArea
        activeChannel={activeChannelObj}
        currentUsername={currentUser?.username || "OPERATOR"}
        connected={connected}
        theme={theme}
        soundEnabled={soundEnabled}
        toggleTheme={toggleTheme}
        toggleSound={toggleSound}
        isVoiceConnected={isInVoice}
        voiceConnectedChannel={currentVoiceChannel}
        voiceUsers={voiceParticipants}
        channelVoiceUsersMap={voiceStates}
        toggleChannelVoice={toggleChannelVoice}
        messages={messages}
        channelLoading={channelLoading}
        typingUsers={typingUsers}
        messagesEndRef={messagesEndRef}
        text={text}
        setText={setText}
        onSend={handleSend}
        onTyping={() => emitTyping(true)}
        inputRef={inputRef}
      />

      <ActiveOperatorsSidebar
        onlineUsers={serverOnlineUsers}
        serverMembers={serverMembers}
        activeServer={activeServer}
        currentUserId={currentUser?.id}
      />

      <CreateServerModal
        isOpen={showServerModal}
        onClose={() => setShowServerModal(false)}
        onSubmit={async (name: string, desc: string) => {
          const server = await createServer(name, desc);
          await switchServer(server.slug);
        }}
      />

      <JoinServerModal
        isOpen={showJoinServerModal}
        onClose={() => setShowJoinServerModal(false)}
        onSubmit={async (code: string) => {
          const server = await joinServerByCode(code);
          await switchServer(server.slug);
        }}
      />

      <LeaveConfirmModal
        isOpen={showLeaveModal}
        targetServer={activeServer}
        serverCount={servers.length}
        onClose={() => setShowLeaveModal(false)}
        onConfirmLeave={async () => {
          if (activeServer) {
            await leaveServer(activeServer.slug);
          }
        }}
        onOpenJoinModal={() => {
          setShowLeaveModal(false);
          setShowJoinServerModal(true);
        }}
        onOpenCreateModal={() => {
          setShowLeaveModal(false);
          setShowServerModal(true);
        }}
      />

      <CreateChannelModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={async (
          name: string,
          slug: string,
          isPrivate: boolean,
          code: string
        ) => {
          await createChannel(name, slug, isPrivate, code, activeServer?.slug);
        }}
      />

      <UnlockChannelModal
        channel={targetUnlockChannel}
        onClose={() => setTargetUnlockChannel(null)}
        onUnlock={async (slug: string, passkey: string) => {
          await joinChannelWithCode(slug, passkey);
          switchChannel(slug);
        }}
      />
    </div>
  );
}