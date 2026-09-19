"use client";
import React, { useState } from "react";
import classes from "./Modal.module.css";

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    name: string,
    slug: string,
    isPrivate: boolean,
    inviteCode: string
  ) => Promise<void>;
}

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [channelName, setChannelName] = useState("");
  const [channelSlug, setChannelSlug] = useState("");
  const [channelIsPrivate, setChannelIsPrivate] = useState(false);
  const [channelInviteCode, setChannelInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(
        channelName.trim(),
        channelSlug.trim(),
        channelIsPrivate,
        channelInviteCode.trim()
      );
      setChannelName("");
      setChannelSlug("");
      setChannelIsPrivate(false);
      setChannelInviteCode("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create channel");
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
              onClick={onClose}
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        </div>

        <div className={classes.modalBody}>
          <div className={classes.modalPrompt}>
            DEPLOY FREQUENCY NODE IN ACTIVE SERVER.
          </div>

          <form onSubmit={handleSubmit}>
            <label className={classes.inputLabel} htmlFor="new-channel-name">
              CHANNEL_NAME // [REQUIRED]
            </label>
            <input
              id="new-channel-name"
              className={classes.textInput}
              placeholder="e.g. project-x"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              autoFocus
              maxLength={50}
              required
            />

            <label className={classes.inputLabel} htmlFor="new-channel-slug">
              CUSTOM_SLUG // [OPTIONAL]
            </label>
            <input
              id="new-channel-slug"
              className={classes.textInput}
              placeholder="e.g. project-x-alpha"
              value={channelSlug}
              onChange={(e) => setChannelSlug(e.target.value)}
              maxLength={50}
            />

            <label className={classes.inputLabel}>FREQUENCY_ACCESS_TYPE</label>
            <div className={classes.typeSelector}>
              <button
                type="button"
                className={`${classes.typeBtn} ${!channelIsPrivate ? classes.typeBtnActive : ""}`}
                onClick={() => setChannelIsPrivate(false)}
              >
                [ PUBLIC / OPEN ]
              </button>
              <button
                type="button"
                className={`${classes.typeBtn} ${channelIsPrivate ? classes.typeBtnActive : ""}`}
                onClick={() => setChannelIsPrivate(true)}
              >
                [ 🔒 PRIVATE / LOCKED ]
              </button>
            </div>

            {channelIsPrivate && (
              <>
                <label className={classes.inputLabel} htmlFor="new-channel-passkey">
                  SECURITY_PASSKEY // [MEMBERS MUST ENTER TO JOIN]
                </label>
                <input
                  id="new-channel-passkey"
                  className={classes.textInput}
                  placeholder="e.g. secret123"
                  value={channelInviteCode}
                  onChange={(e) => setChannelInviteCode(e.target.value)}
                  maxLength={50}
                />
              </>
            )}

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
                disabled={!channelName.trim() || submitting}
              >
                {submitting ? "[ INITIALIZING... ]" : "[ CREATE CHANNEL ↵ ]"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
