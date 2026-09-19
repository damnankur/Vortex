"use client";
import React from "react";
import type { CurrentUser } from "../../types/chat";
import type { Channel, Server } from "../../types/server";
import type { VoiceParticipant } from "../../context/VoiceProvider";
import { avatarStyle } from "../../lib/utils";
import { ServerMetaBar } from "./ServerMetaBar";
import { ChannelItem } from "./ChannelItem";
import classes from "./ChannelSidebar.module.css";

interface ChannelSidebarProps {
  currentUser: CurrentUser | null;
  activeServer: Server | null;
  channels: Channel[];
  activeChannel: string;
  voiceCounts?: Record<string, number>;
  voiceStates?: Record<string, VoiceParticipant[]>;
  onSwitchChannel: (channel: Channel) => void;
  onPrefetchChannel?: (slug: string) => void;
  onOpenCreateChannel: () => void;
  onOpenCreateServer: () => void;
  onOpenJoinServer: () => void;
  onLeaveServer: () => void;
  onResetUser: () => void;
}

export const ChannelSidebar: React.FC<ChannelSidebarProps> = ({
  currentUser,
  activeServer,
  channels,
  activeChannel,
  voiceCounts = {},
  voiceStates = {},
  onSwitchChannel,
  onPrefetchChannel,
  onOpenCreateChannel,
  onOpenCreateServer,
  onOpenJoinServer,
  onLeaveServer,
  onResetUser,
}) => {
  return (
    <aside className={classes.sidebar} aria-label="Channels">
      <div className={classes.brand}>
        <div className={classes.brandLeft}>
          <img
            src="/vortex-logo.png"
            alt="Vortex logo"
            width={34}
            height={34}
            className={classes.brandLogo}
          />
          <span>VORTEX</span>
        </div>
        <div className={classes.brandBadge}>v1.0</div>
      </div>

      {activeServer && (
        <ServerMetaBar
          activeServer={activeServer}
          onOpenCreateServer={onOpenCreateServer}
          onOpenJoinServer={onOpenJoinServer}
          onLeaveServer={onLeaveServer}
        />
      )}

      <div className={classes.channelGroup}>
        <div className={classes.channelGroupHeader}>
          <div className={classes.channelGroupLabel}>[ TEXT CHANNELS ]</div>
          <button
            type="button"
            className={classes.addChannelBtn}
            onClick={onOpenCreateChannel}
            title="Create new channel in active server"
            aria-label="Create new channel"
          >
            [+]
          </button>
        </div>

        {channels.map((ch) => (
          <ChannelItem
            key={ch.slug}
            channel={ch}
            isActive={activeChannel === ch.slug}
            voiceCount={voiceCounts[ch.slug]}
            voiceUsers={voiceStates[ch.slug]}
            onClick={() => onSwitchChannel(ch)}
            onMouseEnter={() => onPrefetchChannel?.(ch.slug)}
          />
        ))}
      </div>

      <div className={classes.userPanel}>
        <div
          className={classes.userAvatar}
          style={avatarStyle(currentUser?.username ?? "Anon")}
          aria-hidden="true"
        >
          {(currentUser?.username ?? "A").slice(0, 2).toUpperCase()}
        </div>
        <div className={classes.userMeta}>
          <div className={classes.userName}>{currentUser?.username ?? "Anonymous"}</div>
          <div className={classes.userStatus}>
            <span className={classes.onlineDot} aria-hidden="true" />
            <span>OPERATOR // ONLINE</span>
          </div>
        </div>
        <button
          type="button"
          className={classes.userSwitch}
          onClick={onResetUser}
          title="Disconnect session"
          aria-label="Disconnect session"
        >
          [ EXIT ]
        </button>
      </div>
    </aside>
  );
};
