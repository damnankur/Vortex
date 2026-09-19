"use client";
import React from "react";
import type { Server } from "../../types/server";
import { getUserColor, serverInitials } from "../../lib/utils";
import classes from "./ServerRail.module.css";

interface ServerRailProps {
  servers: Server[];
  activeServer: Server | null;
  onSwitchServer: (serverSlug: string) => void;
  onOpenCreateModal: () => void;
  onOpenJoinModal: () => void;
  onManageServer: (server: Server) => void;
}

export const ServerRail: React.FC<ServerRailProps> = ({
  servers,
  activeServer,
  onSwitchServer,
  onOpenCreateModal,
  onOpenJoinModal,
  onManageServer,
}) => {
  return (
    <nav className={classes.serverRail} aria-label="Servers">
      {servers.map((srv) => {
        const isActive = activeServer?.slug === srv.slug;
        return (
          <div key={srv.id} className={classes.serverIconWrapper}>
            <div
              className={`${classes.serverPill} ${isActive ? classes.serverPillActive : ""}`}
            />
            <button
              type="button"
              className={`${classes.serverBtn} ${isActive ? classes.serverBtnActive : ""}`}
              onClick={() => onSwitchServer(srv.slug)}
              onContextMenu={(e) => {
                e.preventDefault();
                onManageServer(srv);
              }}
              title={`${srv.name} [CODE: ${srv.inviteCode}] (Right-click to leave/manage)`}
              aria-label={`Server: ${srv.name}`}
              style={!isActive ? { borderLeft: `3.5px solid ${getUserColor(srv.name)}` } : undefined}
            >
              {serverInitials(srv.name)}
            </button>
          </div>
        );
      })}

      <div className={classes.serverDivider} />

      {/* Action: Create Server */}
      <button
        type="button"
        className={classes.serverActionBtn}
        onClick={onOpenCreateModal}
        title="Create New Server"
        aria-label="Create New Server"
      >
        +
      </button>

      {/* Action: Join Server with Code */}
      <button
        type="button"
        className={classes.serverActionBtn}
        onClick={onOpenJoinModal}
        title="Join Server with Invite Code"
        aria-label="Join Server with Invite Code"
      >
        🧭
      </button>
    </nav>
  );
};
