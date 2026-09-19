"use client";
import React from "react";
import { useVoice } from "../../context/VoiceProvider";
import { avatarStyle } from "../../lib/utils";
import classes from "./ChannelVoiceStation.module.css";

interface ChannelVoiceStationProps {
  activeChannel: string;
}

export const ChannelVoiceStation: React.FC<ChannelVoiceStationProps> = ({
  activeChannel,
}) => {
  const {
    currentVoiceChannel,
    isInVoice,
    isConnecting,
    isMuted,
    isDeafened,
    isListenOnly,
    voiceStates,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
  } = useVoice();

  const isInThisChannelVoice = isInVoice && currentVoiceChannel === activeChannel;
  const participants = voiceStates[activeChannel] || [];

  return (
    <div
      className={`${classes.channelVoiceStation} ${
        isInThisChannelVoice ? classes.voiceStationActive : ""
      }`}
    >
      <div className={classes.voiceStationTop}>
        <div className={classes.voiceStationInfo}>
          <span
            className={classes.voiceStationRadar}
            style={
              isInThisChannelVoice
                ? { background: "#00FF66", boxShadow: "0 0 10px #00FF66" }
                : undefined
            }
          />
          <div className={classes.voiceStationTitleRow}>
            <span className={classes.voiceStationBadge}>SYS://VOICE_STATION</span>
            <span className={classes.voiceStationChannel}>#{activeChannel}</span>
            <span className={classes.voiceStationCount}>
              [{participants.length} OPERATORS]
            </span>
            {isListenOnly && (
              <span className={classes.listenOnlyTag}>
                🎧 LISTEN-ONLY MODE
              </span>
            )}
          </div>
        </div>

        <div className={classes.voiceStationActions}>
          {!isInThisChannelVoice ? (
            <button
              className={classes.voiceJoinChannelBtn}
              onClick={() => joinVoice(activeChannel)}
              disabled={isConnecting}
            >
              {isConnecting ? "[ CONNECTING... ]" : "[ 🎙️ TRANSMIT FREQ ]"}
            </button>
          ) : (
            <>
              <button
                className={`${classes.voiceControlBtn} ${
                  isMuted ? classes.voiceControlBtnMuted : ""
                }`}
                onClick={toggleMute}
                title={isMuted ? "Unmute microphone" : "Mute microphone"}
              >
                {isMuted ? "🔴 MIC MUTED" : "🎤 MIC LIVE"}
              </button>

              <button
                className={`${classes.voiceControlBtn} ${
                  isDeafened ? classes.voiceControlBtnMuted : ""
                }`}
                onClick={toggleDeafen}
                title={isDeafened ? "Undeafen sound" : "Deafen sound"}
              >
                {isDeafened ? "🔇 DEAFENED" : "🔊 AUDIO ON"}
              </button>

              <button
                className={classes.voiceLeaveChannelBtn}
                onClick={leaveVoice}
              >
                [ ✕ DISCONNECT ]
              </button>
            </>
          )}
        </div>
      </div>

      {participants.length > 0 && (
        <div className={classes.voiceParticipantsGrid}>
          {participants.map((p) => (
            <div
              key={p.socketId}
              className={`${classes.voiceParticipantCard} ${
                p.isSpeaking ? classes.voiceSpeaking : ""
              }`}
            >
              <div
                className={classes.voiceParticipantAvatar}
                style={avatarStyle(p.username)}
              >
                {p.username.slice(0, 2).toUpperCase()}
                {p.isSpeaking && <span className={classes.voiceHaloRing} />}
              </div>
              <div className={classes.voiceParticipantMeta}>
                <span className={classes.voiceParticipantName}>
                  {p.username}
                  {p.isSelf ? " (YOU)" : ""}
                </span>
                {p.isMuted && (
                  <span className={classes.voiceMutedBadge}>MUTED</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
