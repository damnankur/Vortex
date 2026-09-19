"use client";
import React from "react";
import type { Channel } from "../../types/server";
import type { VoiceParticipant } from "../../context/VoiceProvider";
import classes from "./ChannelSidebar.module.css";

interface ChannelItemProps {
  channel: Channel;
  isActive: boolean;
  voiceCount?: number;
  voiceUsers?: Array<{ userId: string; username: string; isMuted?: boolean }>;
  onClick: () => void;
  onMouseEnter?: () => void;
}

export const ChannelItem: React.FC<ChannelItemProps> = ({
  channel,
  isActive,
  voiceCount,
  voiceUsers,
  onClick,
  onMouseEnter,
}) => {
  return (
    <div className={classes.channelItemWrapper}>
      <button
        type="button"
        className={`${classes.channel} ${isActive ? classes.channelActive : ""}`}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        aria-label={`Channel: ${channel.name}${channel.isPrivate ? " (Private)" : ""}`}
      >
        <span className={classes.channelHash}>{channel.isPrivate ? "🔒" : "#"}</span>
        <span className={classes.channelName}>{channel.name}</span>
        {Boolean(voiceCount && voiceCount > 0) && (
          <span className={classes.channelVoiceBadge} title={`${voiceCount} operators in voice`}>
            🎙 {voiceCount}
          </span>
        )}
        {channel.isPrivate && !channel.isMember && (
          <span className={classes.channelLockIcon} title="Passkey required">
            🔑
          </span>
        )}
      </button>

      {/* Roster of operators currently in this channel's voice call */}
      {Boolean(voiceUsers && voiceUsers.length > 0) && (
        <div className={classes.sidebarVoiceUsersList}>
          {voiceUsers?.map((u) => (
            <div key={u.userId} className={classes.sidebarVoiceUserItem}>
              <span className={classes.sidebarVoiceUserDot} />
              <span className={classes.sidebarVoiceUserName}>{u.username}</span>
              {u.isMuted && <span className={classes.sidebarVoiceMutedTag}>[MUTED]</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
