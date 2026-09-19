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

    const setupPeerWithNegotiation = (targetSocketId: string): RTCPeerConnection => {
      const pc = webrtcRef.current.createPeer(
        targetSocketId,
        localStreamRef.current,
        isDeafenedRef.current,
        (candidate) => {
          socket.emit("voice:signal", {
            targetSocketId,
            signal: { candidate: candidate.toJSON() },
          });
        }
      );

      const isPolite = socket.id ? socket.id.localeCompare(targetSocketId) > 0 : false;
      const neg = webrtcRef.current.getNegotiationState(targetSocketId);

      pc.onnegotiationneeded = async () => {
        try {
          neg.makingOffer = true;
          await pc.setLocalDescription();
          socket.emit("voice:signal", {
            targetSocketId,
            signal: pc.localDescription?.toJSON(),
          });
        } catch (err) {
          console.warn("Negotiation error:", err);
        } finally {
          neg.makingOffer = false;
        }
      };

      return pc;
    };

    const handleVoiceCounts = (counts: Record<string, number>) => setVoiceCounts(counts);
    const handleVoiceState = (state: Record<string, VoiceParticipant[]>) =>
      setVoiceStates(state || {});

    const handleRoomUsers = (payload: {
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

      payload.users.forEach(async (peer) => {
        const pc = setupPeerWithNegotiation(peer.socketId);
        const neg = webrtcRef.current.getNegotiationState(peer.socketId);
        try {
          neg.makingOffer = true;
          const offer = await pc.createOffer();
          if (pc.signalingState !== "stable") return;
          await pc.setLocalDescription(offer);
          socket.emit("voice:signal", {
            targetSocketId: peer.socketId,
            signal: pc.localDescription?.toJSON(),
          });
        } catch (err) {
          console.warn("Initial offer error:", err);
        } finally {
          neg.makingOffer = false;
        }
      });
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
      setupPeerWithNegotiation(payload.user.socketId);
    };

    const handleSignal = async (payload: {
      senderSocketId: string;
      senderUserId: string;
      senderUsername: string;
      signal: RTCSessionDescriptionInit | { candidate: RTCIceCandidateInit };
    }) => {
      let pc = webrtcRef.current.getPeer(payload.senderSocketId);
      if (!pc) {
        pc = setupPeerWithNegotiation(payload.senderSocketId);
      }

      const isPolite = socket.id ? socket.id.localeCompare(payload.senderSocketId) > 0 : false;
      const neg = webrtcRef.current.getNegotiationState(payload.senderSocketId);

      try {
        if ("type" in payload.signal && payload.signal.type) {
          const description = new RTCSessionDescription(payload.signal);
          const offerCollision =
            description.type === "offer" &&
            (neg.makingOffer || pc.signalingState !== "stable");

          neg.ignoreOffer = !isPolite && offerCollision;
          if (neg.ignoreOffer) {
            return;
          }

          if (offerCollision) {
            await pc.setLocalDescription({ type: "rollback" }).catch(() => undefined);
          }

          await pc.setRemoteDescription(description);
          await webrtcRef.current.drainCandidates(payload.senderSocketId, pc);

          if (description.type === "offer") {
            await pc.setLocalDescription();
            socket.emit("voice:signal", {
              targetSocketId: payload.senderSocketId,
              signal: pc.localDescription?.toJSON(),
            });
          }
        } else if ("candidate" in payload.signal && payload.signal.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.signal.candidate));
          } catch (err) {
            if (!neg.ignoreOffer) {
              webrtcRef.current.queueCandidate(payload.senderSocketId, payload.signal.candidate);
            }
          }
        }
      } catch (err) {
        console.warn("Signal error on peer", payload.senderSocketId, err);
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
