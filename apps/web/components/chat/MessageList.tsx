"use client";
import React from "react";
import type { Message } from "../../types/socket";
import type { Channel } from "../../types/server";
import { MessageCard } from "./MessageCard";
import classes from "./MessageList.module.css";

interface MessageListProps {
  messages: Message[];
  activeChannel: Channel | null;
  currentUsername: string;
  channelLoading: boolean;
  typingUsers: string[];
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  activeChannel,
  currentUsername,
  channelLoading,
  typingUsers,
  messagesEndRef,
}) => {
  const getTypingText = () => {
    if (typingUsers.length === 1) {
      return `${typingUsers[0]} is transmitting...`;
    }
    if (typingUsers.length === 2) {
      return `${typingUsers[0]} and ${typingUsers[1]} are transmitting...`;
    }
    if (typingUsers.length > 2) {
      return `${typingUsers[0]} and ${typingUsers.length - 1} others are transmitting...`;
    }
    return "";
  };

  return (
    <>
      <div className={classes.messages}>
        {channelLoading && (
          <div className={classes.emptyState}>
            <div className={classes.emptyBox}>
              <div className={classes.emptyIcon}>⚡</div>
              <div className={classes.emptyTitle}>FETCHING FREQUENCY DATA...</div>
              <div className={classes.emptyText}>
                Retrieving cached channel logs from Redis / Edge storage.
              </div>
            </div>
          </div>
        )}

        {!channelLoading && messages.length === 0 && (
          <div className={classes.emptyState}>
            <div className={classes.emptyBox}>
              <div className={classes.emptyIcon}>Ø</div>
              <div className={classes.emptyTitle}>RADIO SILENCE</div>
              <div className={classes.emptyText}>
                Frequency #{activeChannel?.slug || "general"} is clear. Be the first to broadcast on this channel.
              </div>
            </div>
          </div>
        )}

        {!channelLoading &&
          messages.map((m) => {
            const isOwn =
              m.username?.toLowerCase() === currentUsername.toLowerCase();
            return (
              <MessageCard
                key={m.id || m.messageId}
                msg={m}
                isOwn={isOwn}
                currentUsername={currentUsername}
              />
            );
          })}
        <div ref={messagesEndRef} />
      </div>

      {typingUsers.length > 0 && (
        <div className={classes.typing}>
          <span>{getTypingText()}</span>
          <span className={classes.typingCursor} />
        </div>
      )}
    </>
  );
};
