"use client";
import React, { useState } from "react";
import type { Server } from "../../types/server";
import classes from "./Modal.module.css";

interface LeaveConfirmModalProps {
  isOpen: boolean;
  targetServer: Server | null;
  serverCount: number;
  onClose: () => void;
  onConfirmLeave: () => Promise<void>;
  onOpenJoinModal: () => void;
  onOpenCreateModal: () => void;
}

export const LeaveConfirmModal: React.FC<LeaveConfirmModalProps> = ({
  isOpen,
  targetServer,
  serverCount,
  onClose,
  onConfirmLeave,
  onOpenJoinModal,
  onOpenCreateModal,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !targetServer) return null;

  const isOnlyServer = serverCount <= 1;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirmLeave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave server");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={classes.modalOverlay} role="dialog" aria-modal="true">
      <div className={classes.modalWindow}>
        <div className={classes.windowTitleBar}>
          <div className={classes.windowTitle}>
            <span className={classes.windowPrompt}>&gt;_</span> SYS://
            {isOnlyServer
              ? "CANNOT_LEAVE_ONLY_REALM"
              : targetServer.isOwner
              ? "DELETE_SERVER"
              : "LEAVE_SERVER"}
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
          {isOnlyServer ? (
            <>
              <div className={classes.modalPrompt}>
                <span style={{ color: "var(--accent-pink)", fontWeight: 800 }}>
                  [!] CANNOT DEPART YOUR ONLY REALM [{targetServer.name.toUpperCase()}]
                </span>
                <br />
                <br />
                Vortex requires at least one active community or private realm to maintain your operator session.
                To depart this realm, join another friend group realm using an invite code or create a new realm first.
              </div>

              <div
                className={classes.channelModalBtns}
                style={{ marginTop: "16px", display: "flex", gap: "8px", flexWrap: "wrap" }}
              >
                <button
                  type="button"
                  className={classes.confirmBtn}
                  onClick={() => {
                    onClose();
                    onOpenJoinModal();
                  }}
                >
                  [ 🧭 JOIN ANOTHER REALM ]
                </button>
                <button
                  type="button"
                  className={classes.confirmBtn}
                  onClick={() => {
                    onClose();
                    onOpenCreateModal();
                  }}
                >
                  [ + CREATE REALM ]
                </button>
                <button
                  type="button"
                  className={classes.cancelBtn}
                  onClick={onClose}
                >
                  [ CLOSE ]
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={classes.modalPrompt}>
                <span style={{ color: "var(--text-primary)", fontWeight: 800 }}>
                  {targetServer.isOwner
                    ? `CONFIRM PERMANENT TERMINATION OF [${targetServer.name.toUpperCase()}]?`
                    : `CONFIRM DEPARTURE FROM [${targetServer.name.toUpperCase()}]?`}
                </span>
                <br />
                <br />
                {targetServer.isOwner
                  ? "WARNING: YOU ARE THE REALM OWNER. TERMINATING THIS SERVER WILL PURGE ALL CHANNELS, MEMBERSHIPS, AND DISCUSSIONS. YOU WILL BE SAFELY REROUTED TO YOUR REMAINING REALM."
                  : "YOU WILL BE DISCONNECTED FROM ALL ITS CHANNELS AND CEASE TO RECEIVE DISPATCHES UNTIL RE-INVITED. YOU WILL BE SAFELY REROUTED TO YOUR REMAINING REALM."}
              </div>

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
                  type="button"
                  className={classes.dangerBtn}
                  onClick={handleConfirm}
                  disabled={submitting}
                >
                  {submitting
                    ? "[ COMMITTING... ]"
                    : targetServer.isOwner
                    ? "[ ⏻ TERMINATE SERVER ]"
                    : "[ ⏻ LEAVE SERVER ]"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
