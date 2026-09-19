"use client";
import React, { useState } from "react";
import type { Server } from "../../types/server";
import classes from "./ServerMetaBar.module.css";

interface ServerMetaBarProps {
  activeServer: Server;
  onOpenCreateServer: () => void;
  onOpenJoinServer: () => void;
  onLeaveServer: () => void;
}

export const ServerMetaBar: React.FC<ServerMetaBarProps> = ({
  activeServer,
  onOpenCreateServer,
  onOpenJoinServer,
  onLeaveServer,
}) => {
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyInvite = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(activeServer.inviteCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className={classes.serverMetaBar}>
      <div className={classes.serverMetaHeader}>
        <button
          type="button"
          className={classes.serverMetaNameBtn}
          onClick={() => setShowServerMenu(!showServerMenu)}
          title="Toggle server menu"
          aria-label="Toggle server menu"
          aria-expanded={showServerMenu}
        >
          <span className={classes.serverMetaName} title={activeServer.name}>
            {activeServer.name}
          </span>
          <span style={{ fontSize: "10px", opacity: 0.7 }}>
            {showServerMenu ? "▲" : "▼"}
          </span>
        </button>
        <button
          type="button"
          className={classes.serverCreateMiniBtn}
          onClick={onOpenCreateServer}
          title="Create a new server realm"
          aria-label="Create server"
        >
          + SERVER
        </button>
      </div>

      {/* Discord-style Dropdown Menu */}
      {showServerMenu && (
        <div className={classes.serverDropdownMenu}>
          <button
            type="button"
            className={classes.serverDropdownItem}
            onClick={() => {
              setShowServerMenu(false);
              handleCopyInvite();
            }}
          >
            <span>📋</span>
            <span>{copiedCode ? "CODE COPIED!" : `COPY INVITE: ${activeServer.inviteCode}`}</span>
          </button>

          <button
            type="button"
            className={classes.serverDropdownItem}
            onClick={() => {
              setShowServerMenu(false);
              onOpenCreateServer();
            }}
          >
            <span>➕</span>
            <span>CREATE NEW REALM</span>
          </button>

          <button
            type="button"
            className={classes.serverDropdownItem}
            onClick={() => {
              setShowServerMenu(false);
              onOpenJoinServer();
            }}
          >
            <span>🧭</span>
            <span>JOIN REALM WITH CODE</span>
          </button>

          <button
            type="button"
            className={`${classes.serverDropdownItem} ${classes.serverDropdownItemDanger}`}
            onClick={() => {
              setShowServerMenu(false);
              onLeaveServer();
            }}
          >
            <span>⏻</span>
            <span>{activeServer.isOwner ? "DELETE REALM" : "LEAVE REALM"}</span>
          </button>
        </div>
      )}

      <div className={classes.serverMetaActionsRow}>
        <button
          type="button"
          className={classes.serverInviteBtn}
          onClick={handleCopyInvite}
          title="Click to copy server invite code"
        >
          <span>INVITE: {activeServer.inviteCode}</span>
          <span>{copiedCode ? "✓" : "📋"}</span>
        </button>
        <button
          type="button"
          className={classes.serverLeaveBtn}
          onClick={onLeaveServer}
          title={activeServer.isOwner ? "Delete this server" : "Leave this server"}
          aria-label={activeServer.isOwner ? "Delete server" : "Leave server"}
        >
          {activeServer.isOwner ? "⏻ DELETE" : "⏻ LEAVE"}
        </button>
      </div>
    </div>
  );
};

