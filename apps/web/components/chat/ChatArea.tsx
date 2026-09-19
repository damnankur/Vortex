"use client";
import React from "react";
import type { Channel } from "../../types/server";
import type { Message } from "../../types/socket";
import type { VoiceParticipant } from "../../context/VoiceProvider";
import { ChannelVoiceStation } from "../voice/ChannelVoiceStation";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import classes from "./ChatArea.module.css";

interface ChatAreaProps {
  activeChannel: Channel | null;
  currentUsername: string;
  connected: boolean;
  theme: "light" | "dark";
  soundEnabled: boolean;
  toggleTheme: () => void;
  toggleSound: () => void;
  // Voice state
  isVoiceConnected: boolean;
  voiceConnectedChannel: string | null;
  voiceUsers: VoiceParticipant[];
  channelVoiceUsersMap: Record<string, VoiceParticipant[]>;
  toggleChannelVoice: (channelSlug: string) => void;
  // Messages state
  messages: Message[];
  channelLoading: boolean;
  typingUsers: string[];
  messagesEndRef: React.RefObject<HTMLDivElement>;
  // Input state
  text: string;
  setText: (value: string) => void;
  onSend: () => void;
  onTyping: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  activeChannel,
  currentUsername,
  connected,
  theme,
  soundEnabled,
  toggleTheme,
  toggleSound,
  isVoiceConnected,
  voiceConnectedChannel,
  voiceUsers,
  channelVoiceUsersMap,
  toggleChannelVoice,
  messages,
  channelLoading,
  typingUsers,
  messagesEndRef,
  text,
  setText,
  onSend,
  onTyping,
  inputRef,
}) => {
  const isInThisVoice =
    isVoiceConnected && voiceConnectedChannel === activeChannel?.slug;
  const channelVoiceUsers =
    (activeChannel?.slug && channelVoiceUsersMap[activeChannel.slug]) || [];

  return (
    <main className={classes.chat}>
      <header className={classes.chatHeader}>
        <div className={classes.chatHeaderMain}>
          <div className={classes.chatTitle}>
            <span>#</span>
            <span>{activeChannel?.slug || "general"}</span>
          </div>
          {activeChannel?.topic ? (
            <span className={classes.chatTopic}>{activeChannel.topic}</span>
          ) : (
            <span className={classes.chatTopic}>DIRECT TRANSMISSION FREQ</span>
          )}
        </div>

        <div className={classes.chatHeaderControls}>
          {activeChannel && (
            <button
              className={
                isInThisVoice
                  ? classes.voiceHeaderConnectedBtn
                  : classes.voiceHeaderBtn
              }
              onClick={() => toggleChannelVoice(activeChannel.slug)}
              title={
                isInThisVoice
                  ? "Leave current voice station"
                  : isVoiceConnected
                  ? `Switch voice station to #${activeChannel.slug}`
                  : "Join voice station"
              }
            >
              {isInThisVoice ? (
                <>
                  <span>●</span>
                  <span>LEAVE VOICE ({voiceUsers.length})</span>
                </>
              ) : (
                <>
                  <span>🎙️</span>
                  <span>
                    {channelVoiceUsers.length > 0
                      ? `VOICE (${channelVoiceUsers.length})`
                      : "JOIN VOICE"}
                  </span>
                </>
              )}
            </button>
          )}

          <button
            className={`${classes.notifyBtn} ${
              soundEnabled ? classes.notifyActive : ""
            }`}
            onClick={toggleSound}
            title="Toggle audio notifications"
          >
            {soundEnabled ? "🔔 AUDIO ON" : "🔕 AUDIO MUTED"}
          </button>

          <button
            className={classes.themeToggleBtn}
            onClick={toggleTheme}
            title="Toggle Dark / Light cyber-brutalist theme"
          >
            {theme === "dark" ? "☀ LIGHT" : "☾ DARK"}
          </button>

          <div className={classes.status}>
            <span
              className={`${classes.dot} ${
                connected ? classes.dotOnline : ""
              }`}
            />
            <span>{connected ? "ONLINE" : "OFFLINE"}</span>
          </div>
        </div>
      </header>

      <ChannelVoiceStation
        activeChannel={activeChannel?.slug || "general"}
      />

      <MessageList
        messages={messages}
        activeChannel={activeChannel}
        currentUsername={currentUsername}
        channelLoading={channelLoading}
        typingUsers={typingUsers}
        messagesEndRef={messagesEndRef}
      />

      <ChatInput
        text={text}
        setText={setText}
        onSend={onSend}
        onTyping={onTyping}
        activeChannel={activeChannel}
        inputRef={inputRef}
      />
    </main>
  );
};

