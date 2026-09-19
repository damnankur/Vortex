"use client";
import React, { useState } from "react";
import classes from "./Modal.module.css";

interface JoinServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (inviteCode: string) => Promise<void>;
}

export const JoinServerModal: React.FC<JoinServerModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(inviteCode.trim());
      setInviteCode("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join server");
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
              onClick={onClose}
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        </div>

        <div className={classes.modalBody}>
          <div className={classes.modalPrompt}>
            ENTER A SERVER INVITE PASSKEY TO ESTABLISH MEMBERSHIP.
          </div>

          <form onSubmit={handleSubmit}>
            <label className={classes.inputLabel} htmlFor="join-server-code">
              INVITE_PASSKEY // [FORMAT: VX-XXXX]
            </label>
            <input
              id="join-server-code"
              className={classes.textInput}
              placeholder="e.g. VX-4B9X"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              autoFocus
              maxLength={15}
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
                disabled={!inviteCode.trim() || submitting}
              >
                {submitting ? "[ CONNECTING... ]" : "[ JOIN REALM ↵ ]"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

