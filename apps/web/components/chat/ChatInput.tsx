"use client";
import React from "react";
import type { Channel } from "../../types/server";
import classes from "./ChatInput.module.css";

interface ChatInputProps {
  text: string;
  setText: (value: string) => void;
  onSend: () => void;
  onTyping: () => void;
  activeChannel: Channel | null;
  inputRef: React.RefObject<HTMLInputElement>;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  text,
  setText,
  onSend,
  onTyping,
  activeChannel,
  inputRef,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className={classes.inputArea}>
      <div className={classes.inputRow}>
        <input
          ref={inputRef}
          className={classes.input}
          placeholder={`TRANSMIT MESSAGE IN #${activeChannel?.slug || "general"} (ENTER TO SEND)`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTyping();
          }}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <button
          className={classes.sendBtn}
          onClick={onSend}
          disabled={!text.trim()}
        >
          SEND ↵
        </button>
      </div>
    </div>
  );
};
