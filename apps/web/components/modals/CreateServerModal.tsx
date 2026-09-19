"use client";
import React, { useState } from "react";
import classes from "./Modal.module.css";

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, description: string) => Promise<void>;
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [serverName, setServerName] = useState("");
  const [serverDescription, setServerDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverName.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(serverName.trim(), serverDescription.trim());
      setServerName("");
      setServerDescription("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create server");
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
              onClick={onClose}
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        </div>

        <div className={classes.modalBody}>
          <div className={classes.modalPrompt}>
            INITIALIZE A NEW DISCORD-STYLE SERVER REALM.
          </div>

          <form onSubmit={handleSubmit}>
            <label className={classes.inputLabel} htmlFor="new-server-name">
              SERVER_REALM_NAME // [REQUIRED]
            </label>
            <input
              id="new-server-name"
              className={classes.textInput}
              placeholder="e.g. Cyber Syndicate"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              autoFocus
              maxLength={50}
              required
            />

            <label className={classes.inputLabel} htmlFor="new-server-desc">
              PURPOSE // [OPTIONAL]
            </label>
            <input
              id="new-server-desc"
              className={classes.textInput}
              placeholder="e.g. Encrypted tactical transmissions"
              value={serverDescription}
              onChange={(e) => setServerDescription(e.target.value)}
              maxLength={120}
            />

            {error && (
              <div className={classes.errorBanner} role="alert">
                <span>[!]</span> {error}
              </div>
            )}

            <div className={classes.channelModalBtns}>
              <button
                type="button"
                className={classes.cancelBtn}
                onClick={onClose}
              >
                [ CANCEL ]
              </button>
              <button
                type="submit"
                className={classes.confirmBtn}
                disabled={!serverName.trim() || submitting}
              >
                {submitting ? "[ INITIALIZING... ]" : "[ CREATE REALM ↵ ]"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
