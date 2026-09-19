"use client";
import React from "react";
import type { PresenceUser } from "../../types/chat";
import type { Server, ServerMember } from "../../types/server";
import { getUserColor } from "../../lib/utils";
import classes from "./ActiveOperatorsSidebar.module.css";

interface ActiveOperatorsSidebarProps {
  onlineUsers: PresenceUser[];
  serverMembers: ServerMember[];
  activeServer: Server | null;
  currentUserId?: string;
}

export const ActiveOperatorsSidebar: React.FC<ActiveOperatorsSidebarProps> = ({
  onlineUsers,
  serverMembers,
  activeServer,
  currentUserId,
}) => {
  return (
    <aside className={classes.members} aria-label="Members Directory">
      <div className={classes.membersHeader}>
        [ DIRECTORY // {onlineUsers.length} ONLINE ]
      </div>
      <div className={classes.membersSection}>
        {activeServer
          ? `[ ${activeServer.name.toUpperCase()} ]`
          : "[ ACTIVE OPERATORS ]"}
      </div>

      {onlineUsers.length === 0 ? (
        <div className={classes.membersEmpty}>NO OPERATORS DETECTED.</div>
      ) : (
        onlineUsers.map((user) => {
          const memberInfo = serverMembers.find(
            (m) => m.userId === user.userId
          );
          const isOwner =
            memberInfo?.role === "OWNER" ||
            (user.userId === currentUserId && Boolean(activeServer?.isOwner));
          const isBot = memberInfo?.role === "BOT";

          return (
            <div key={user.userId} className={classes.member}>
              <span
                className={classes.memberSquare}
                style={{ background: getUserColor(user.username) }}
              />
              <span
                className={classes.memberName}
                style={{ color: getUserColor(user.username) }}
              >
                {user.username}
                {user.userId === currentUserId ? " (YOU)" : ""}
              </span>
              {isOwner && (
                <span className={classes.ownerBadge}>OWNER</span>
              )}
              {isBot && (
                <span className={classes.botBadge}>BOT</span>
              )}
            </div>
          );
        })
      )}
    </aside>
  );
};
