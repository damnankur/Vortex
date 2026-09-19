import { useEffect } from "react";
import type { Socket } from "socket.io-client";
import type { VoiceParticipant } from "../context/VoiceProvider";
import type { WebRTCMeshService } from "../services/webrtc";

interface VoiceSocketParams {
  socket: Socket | null;
  webrtcRef: React.MutableRefObject<WebRTCMeshService>;
  localStreamRef: React.MutableRefObject<MediaStream | null>;
  isDeafenedRef: React.MutableRefObject<boolean>;
  setVoiceCounts: (counts: Record<string, number>) => void;
  setVoiceStates: (states: Record<string, VoiceParticipant[]>) => void;
  setVoiceParticipants: React.Dispatch<React.SetStateAction<VoiceParticipant[]>>;
}

export function useVoiceSocket({
  socket,
  webrtcRef,
  localStreamRef,
  isDeafenedRef,
  setVoiceCounts,
  setVoiceStates,
  setVoiceParticipants,
}: VoiceSocketParams) {
  useEffect(() => {
    if (!socket) return;

    const handleVoiceCounts = (counts: Record<string, number>) => setVoiceCounts(counts);
    const handleVoiceState = (state: Record<string, VoiceParticipant[]>) =>
      setVoiceStates(state || {});

    const handleRoomUsers = async (payload: {
      channelSlug: string;
      users: Array<{ userId: string; username: string; socketId: string; isMuted?: boolean }>;
    }) => {
      setVoiceParticipants((prev) => {
        const self = prev.find((p) => p.isSelf);
        const remotes: VoiceParticipant[] = payload.users.map((u) => ({
          userId: u.userId,
          username: u.username,
          socketId: u.socketId,
          isMuted: Boolean(u.isMuted),
          isSpeaking: false,
          isSelf: false,
        }));
        return self ? [self, ...remotes] : remotes;
      });

      for (const peer of payload.users) {
        try {
          const pc = webrtcRef.current.createPeer(
            peer.socketId,
            localStreamRef.current,
            isDeafenedRef.current,
            (cand) =>
              socket.emit("voice:signal", {
                targetSocketId: peer.socketId,
                signal: { candidate: cand },
              })
          );
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("voice:signal", { targetSocketId: peer.socketId, signal: offer });
        } catch {
          // ignore peer offer errors
        }
      }
    };

    const handleUserJoined = (payload: {
      channelSlug: string;
      user: { userId: string; username: string; socketId: string; isMuted?: boolean };
    }) => {
      setVoiceParticipants((prev) => {
        if (prev.some((p) => p.socketId === payload.user.socketId)) return prev;
        return [
          ...prev,
          {
            userId: payload.user.userId,
            username: payload.user.username,
            socketId: payload.user.socketId,
            isMuted: Boolean(payload.user.isMuted),
            isSpeaking: false,
            isSelf: false,
          },
        ];
      });
    };

    const handleSignal = async (payload: {
      senderSocketId: string;
      senderUserId: string;
      senderUsername: string;
      signal: RTCSessionDescriptionInit | { candidate: RTCIceCandidateInit };
    }) => {
      let pc = webrtcRef.current.getPeer(payload.senderSocketId);
      if (!pc) {
        pc = webrtcRef.current.createPeer(
          payload.senderSocketId,
          localStreamRef.current,
          isDeafenedRef.current,
          (cand) =>
            socket.emit("voice:signal", {
              targetSocketId: payload.senderSocketId,
              signal: { candidate: cand },
            })
        );
      }

      try {
        if ("type" in payload.signal && payload.signal.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.signal));
          await webrtcRef.current.drainCandidates(payload.senderSocketId, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("voice:signal", { targetSocketId: payload.senderSocketId, signal: answer });
        } else if ("type" in payload.signal && payload.signal.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.signal));
          await webrtcRef.current.drainCandidates(payload.senderSocketId, pc);
        } else if ("candidate" in payload.signal && payload.signal.candidate) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.signal.candidate));
          } else {
            webrtcRef.current.queueCandidate(payload.senderSocketId, payload.signal.candidate);
          }
        }
      } catch (err) {
        console.warn("Voice signal error:", err);
      }
    };

    const handleUserMuted = (p: { userId: string; socketId: string; isMuted: boolean }) => {
      setVoiceParticipants((prev) =>
        prev.map((u) => (u.socketId === p.socketId ? { ...u, isMuted: p.isMuted } : u))
      );
    };

    const handleUserLeft = (p: { channelSlug: string; userId: string; socketId: string }) => {
      webrtcRef.current.removePeer(p.socketId);
      setVoiceParticipants((prev) => prev.filter((u) => u.socketId !== p.socketId));
    };

    socket.on("voice:counts", handleVoiceCounts);
    socket.on("voice:state", handleVoiceState);
    socket.on("voice:room-users", handleRoomUsers);
    socket.on("voice:user-joined", handleUserJoined);
    socket.on("voice:signal", handleSignal);
    socket.on("voice:user-muted", handleUserMuted);
    socket.on("voice:user-left", handleUserLeft);

    return () => {
      socket.off("voice:counts", handleVoiceCounts);
      socket.off("voice:state", handleVoiceState);
      socket.off("voice:room-users", handleRoomUsers);
      socket.off("voice:user-joined", handleUserJoined);
      socket.off("voice:signal", handleSignal);
      socket.off("voice:user-muted", handleUserMuted);
      socket.off("voice:user-left", handleUserLeft);
    };
  }, [
    socket,
    webrtcRef,
    localStreamRef,
    isDeafenedRef,
    setVoiceCounts,
    setVoiceStates,
    setVoiceParticipants,
  ]);
}
