"use client";
import { useState } from "react";
import { useSocket } from "../context/SocketProvider";
import classes from "./page.module.css";

export default function Page() {
  const { sendMessage, messages } = useSocket();
  const [message, setMessage] = useState("");

  const handleMessageSend = () => {
    if (message.trim() !== "") {
      sendMessage(message);
      setMessage("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleMessageSend();
  };

  return (
    <div className={classes.container}>
      <h1 className={classes.title}>Skat</h1>
      <div className={classes.inputContainer}>
        <input
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyPress}
          value={message}
          className={classes.chatInput}
          placeholder="Type your message..."
        />
        <button onClick={handleMessageSend} className={classes.button}>
          Send
        </button>
      </div>
      <div className={classes.messageContainer}>
        <h2 className={classes.heading}>Messages</h2>
        <ul className={classes.messageList}>
          {messages.map((msg, index) => (
            <li key={index} className={classes.message}>{msg}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
