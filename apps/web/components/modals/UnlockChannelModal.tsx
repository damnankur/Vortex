"use client";
import React, { useState } from "react";
import type { Channel } from "../../types/server";
import classes from "./Modal.module.css";

interface UnlockChannelModalProps {
  channel: Channel | null;
  onClose: () => void;
  onUnlock: (slug: string, passkey: string) => Promise<void>;
}

export const UnlockChannelModal: React.FC<UnlockChannelModalProps> = ({
  channel,
  onClose,
  onUnlock,
}) => {
  const [passkey, setPasskey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!channel) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passkey.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onUnlock(channel.slug, passkey.trim());
      setPasskey("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid channel passkey");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={classes.modalOverlay} role="dialog" aria-modal="true">
      <div className={classes.modalWindow}>
        <div className={classes.windowTitleBar}>
          <div className={classes.windowTitle}>
            <span className={classes.windowPrompt}>&gt;_</span> SYS://SECURE_CHANNEL_GATEWAY
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
            CHANNEL [{channel.name.toUpperCase()}] IS ENCRYPTED.
            <br />
            ENTER THE CHANNEL PASSKEY TO DECRYPT AND JOIN.
          </div>

          <form onSubmit={handleSubmit}>
            <label className={classes.inputLabel} htmlFor="channel-passkey">
              SECURITY_PASSKEY //
            </label>
            <input
              id="channel-passkey"
              type="password"
              className={classes.textInput}
              placeholder="••••••••••••"
              value={passkey}
              onChange={(e) => setPasskey(e.target.value)}
              autoFocus
              required
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
                disabled={!passkey.trim() || submitting}
              >
                {submitting ? "[ VERIFYING... ]" : "[ UNLOCK & JOIN ↵ ]"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

