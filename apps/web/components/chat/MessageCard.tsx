"use client";
import React, { Fragment } from "react";
import type { Message } from "../../types/socket";
import { avatarStyle, getUserColor, formatTime } from "../../lib/utils";
import classes from "./MessageList.module.css";

interface MessageCardProps {
  msg: Message;
  isOwn: boolean;
  currentUsername: string;
}

export const MessageCard: React.FC<MessageCardProps> = ({
  msg,
  isOwn,
  currentUsername,
}) => {
  const authorName = msg.username || "Anonymous";

  const renderText = (content: string) => {
    const mentionRegex = /(@[a-zA-Z0-9_-]+)/g;
    const parts = content.split(mentionRegex);
    return parts.map((part, index) => {
      if (part.startsWith("@")) {
        const isSelfMention =
          part.slice(1).toLowerCase() === currentUsername.toLowerCase();
        return (
          <span
            key={index}
            className={classes.mentionHighlight}
            style={
              isSelfMention
                ? { background: "var(--accent)", color: "#000000", borderColor: "#000000" }
                : undefined
            }
          >
            {part}
          </span>
        );
      }
      return <Fragment key={index}>{part}</Fragment>;
    });
  };

  return (
    <div
      className={`${classes.messageRow} ${isOwn ? classes.messageRowOwn : ""}`}
    >
      <div
        className={classes.messageAvatar}
        style={avatarStyle(authorName)}
        aria-hidden="true"
      >
        {authorName.slice(0, 2).toUpperCase()}
      </div>
      <div
        className={`${classes.messageCard} ${isOwn ? classes.messageCardOwn : ""}`}
        style={!isOwn ? { borderLeft: `3.5px solid ${getUserColor(authorName)}` } : undefined}
      >
        <div className={classes.messageHeader}>
          <span
            className={classes.messageUser}
            style={{ color: getUserColor(authorName) }}
          >
            {authorName}
          </span>
          {isOwn && <span className={classes.messageTag}>YOU</span>}
          <span className={classes.messageTime}>
            {formatTime(msg.createdAt)}
          </span>
        </div>
        <div className={classes.messageText}>{renderText(msg.text)}</div>
      </div>
    </div>
  );
};
