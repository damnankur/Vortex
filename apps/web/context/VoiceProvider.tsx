"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSocket } from "./SocketProvider";

export interface VoiceParticipant {
  userId: string;
  username: string;
  socketId: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isSelf?: boolean;
}

export interface IVoiceContext {
  currentVoiceChannel: string | null;
  isInVoice: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isListenOnly: boolean;
  voiceError: string | null;
  voiceParticipants: VoiceParticipant[];
  voiceCounts: Record<string, number>;
  voiceStates: Record<string, VoiceParticipant[]>;
  joinVoice: (channelSlug: string) => Promise<void>;
  leaveVoice: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
}

const VoiceContext = createContext<IVoiceContext | null>(null);

export const useVoice = () => {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within a VoiceProvider");
  return ctx;
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket, currentUser } = useSocket();

  const [currentVoiceChannel, setCurrentVoiceChannel] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isListenOnly, setIsListenOnly] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([]);
  const [voiceCounts, setVoiceCounts] = useState<Record<string, number>>({});
  const [voiceStates, setVoiceStates] = useState<Record<string, VoiceParticipant[]>>({});
  const [selfSpeaking, setSelfSpeaking] = useState(false);

  // References to WebRTC components
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isDeafenedRef = useRef(isDeafened);
  isDeafenedRef.current = isDeafened;

  // Cleanup WebRTC and media streams
  const cleanupVoiceSession = useCallback(() => {
    // Stop local mic stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    // Close all peer connections
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();

    // Remove remote audio elements
    audioElementsRef.current.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();

    // Close AudioContext / analyser
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }

    pendingCandidatesRef.current.clear();
    setVoiceParticipants([]);
    setCurrentVoiceChannel(null);
    setIsConnecting(false);
    setIsListenOnly(false);
    setSelfSpeaking(false);
  }, []);

  // Leave active voice call
  const leaveVoice = useCallback(() => {
    if (socket && currentVoiceChannel) {
      socket.emit("voice:leave");
    }
    cleanupVoiceSession();
  }, [cleanupVoiceSession, currentVoiceChannel, socket]);

  // Setup Voice Activity Detection (Speaking Halo)
  const setupVoiceActivityDetection = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkAudioLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const val = dataArray[i];
          if (val !== undefined) {
            sum += val;
          }
        }
        const avg = sum / (dataArray.length || 1);
        const speaking = avg > 15; // Voice threshold
        setSelfSpeaking(speaking);

        animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
      };

      checkAudioLevel();
    } catch {
      // AudioContext may be restricted by browser policy
    }
  }, []);

  // Create PeerConnection for a remote socket
  const createPeerConnection = useCallback(
    (targetSocketId: string, remoteUser: { userId: string; username: string }) => {
      if (peersRef.current.has(targetSocketId)) {
        return peersRef.current.get(targetSocketId)!;
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(targetSocketId, pc);

      // Attach local stream tracks, or configure recvonly for listen-only mode
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      } else {
        try {
          pc.addTransceiver("audio", { direction: "recvonly" });
        } catch {
          // ignore
        }
      }

      // Handle ICE Candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit("voice:signal", {
            targetSocketId,
            signal: { candidate: event.candidate },
          });
        }
      };

      // Handle Remote Audio Track
      pc.ontrack = (event) => {
        let audio = audioElementsRef.current.get(targetSocketId);
        if (!audio) {
          audio = document.createElement("audio");
          audio.autoplay = true;
          audio.muted = isDeafenedRef.current;
          document.body.appendChild(audio);
          audioElementsRef.current.set(targetSocketId, audio);
        }
        audio.srcObject = event.streams[0] || null;
        audio.play().catch(() => undefined);
      };

      // Handle Connection State Changes
      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          pc.close();
          peersRef.current.delete(targetSocketId);
          const audio = audioElementsRef.current.get(targetSocketId);
          if (audio) {
            audio.srcObject = null;
            audio.remove();
            audioElementsRef.current.delete(targetSocketId);
          }
        }
      };

      return pc;
    },
    [socket]
  );

  // Join Voice Call in Channel
  const joinVoice = useCallback(
    async (channelSlug: string) => {
      if (!socket || !currentUser) {
        setVoiceError("You must be authenticated to connect to voice channels.");
        return;
      }

      // If already in this voice channel, do nothing
      if (currentVoiceChannel === channelSlug) return;

      // Leave previous channel if in one
      if (currentVoiceChannel) {
        leaveVoice();
      }

      setIsConnecting(true);
      setVoiceError(null);

      let stream: MediaStream | null = null;
      let listenOnly = false;

      // Request microphone access with graceful fallback to listen-only
      if (
        typeof navigator !== "undefined" &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === "function"
      ) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
        } catch (err: unknown) {
          console.warn("Microphone access failed, connecting in listen-only mode:", err);
          listenOnly = true;
          setVoiceError("Microphone unavailable or blocked. Connected in Listen-Only mode.");
        }
      } else {
        listenOnly = true;
        setVoiceError("Microphone not supported on this device/connection. Connected in Listen-Only mode.");
      }

      setIsListenOnly(listenOnly);

      if (stream) {
        localStreamRef.current = stream;
        setupVoiceActivityDetection(stream);
      } else {
        localStreamRef.current = null;
      }

      // Add self to voice participants
      setVoiceParticipants([
        {
          userId: currentUser.id,
          username: currentUser.username,
          socketId: socket.id || "",
          isMuted: listenOnly,
          isSpeaking: false,
          isSelf: true,
        },
      ]);

      setCurrentVoiceChannel(channelSlug);
      setIsMuted(listenOnly);
      setIsDeafened(false);

      // Notify server that we're joining voice in this channel
      socket.emit("voice:join", { channelSlug });
      setIsConnecting(false);
    },
    [
      socket,
      currentUser,
      currentVoiceChannel,
      leaveVoice,
      setupVoiceActivityDetection,
    ]
  );

  // Toggle Mute
  const toggleMute = useCallback(() => {
    if (isListenOnly) {
      setVoiceError("Microphone input is not available in Listen-Only mode.");
      return;
    }
    if (!localStreamRef.current) return;
    const nextMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);

    if (socket) {
      socket.emit("voice:mute", { isMuted: nextMuted });
    }

    setVoiceParticipants((prev) =>
      prev.map((p) => (p.isSelf ? { ...p, isMuted: nextMuted } : p))
    );
  }, [isListenOnly, isMuted, socket]);

  // Toggle Deafen
  const toggleDeafen = useCallback(() => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);
    isDeafenedRef.current = nextDeafened;

    // Mute all remote audio elements
    audioElementsRef.current.forEach((audio) => {
      audio.muted = nextDeafened;
    });

    // When deafened, automatically mute microphone as well
    if (nextDeafened && !isMuted) {
      toggleMute();
    }
  }, [isDeafened, isMuted, toggleMute]);

  // Socket Event Listeners for Voice Calling
  useEffect(() => {
    if (!socket) return;

    // Initial voice counts across server
    const handleVoiceCounts = (counts: Record<string, number>) => {
      setVoiceCounts(counts);
    };

    // Existing peers in the joined room
    const handleRoomUsers = async (payload: {
      channelSlug: string;
      users: Array<{ userId: string; username: string; socketId: string; isMuted?: boolean }>;
    }) => {
      const peers = payload.users;

      // Add remote participants to state
      setVoiceParticipants((prev) => {
        const self = prev.find((p) => p.isSelf);
        const remoteParticipants: VoiceParticipant[] = peers.map((u) => ({
          userId: u.userId,
          username: u.username,
          socketId: u.socketId,
          isMuted: Boolean(u.isMuted),
          isSpeaking: false,
          isSelf: false,
        }));
        return self ? [self, ...remoteParticipants] : remoteParticipants;
      });

      // Initiate WebRTC offers to each existing peer
      for (const peer of peers) {
        try {
          const pc = createPeerConnection(peer.socketId, {
            userId: peer.userId,
            username: peer.username,
          });
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket.emit("voice:signal", {
            targetSocketId: peer.socketId,
            signal: offer,
          });
        } catch {
          // Ignore offer failure for single peer
        }
      }
    };

    // When another peer joins after us
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

    // WebRTC Signaling (Offer, Answer, Candidate)
    const handleSignal = async (payload: {
      senderSocketId: string;
      senderUserId: string;
      senderUsername: string;
      signal:
        | RTCSessionDescriptionInit
        | { candidate: RTCIceCandidateInit };
    }) => {
      const { senderSocketId, senderUserId, senderUsername, signal } = payload;
      let pc = peersRef.current.get(senderSocketId);

      if (!pc) {
        pc = createPeerConnection(senderSocketId, {
          userId: senderUserId,
          username: senderUsername,
        });
      }

      try {
        if ("type" in signal && signal.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          // Drain any queued ICE candidates for this sender
          const queued = pendingCandidatesRef.current.get(senderSocketId) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => undefined);
          }
          pendingCandidatesRef.current.delete(senderSocketId);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit("voice:signal", {
            targetSocketId: senderSocketId,
            signal: answer,
          });
        } else if ("type" in signal && signal.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          // Drain any queued ICE candidates for this sender
          const queued = pendingCandidatesRef.current.get(senderSocketId) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => undefined);
          }
          pendingCandidatesRef.current.delete(senderSocketId);
        } else if ("candidate" in signal && signal.candidate) {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            const list = pendingCandidatesRef.current.get(senderSocketId) || [];
            list.push(signal.candidate);
            pendingCandidatesRef.current.set(senderSocketId, list);
          }
        }
      } catch (err) {
        console.warn("Signaling error:", err);
      }
    };

    // When voice state across the entire server updates
    const handleVoiceState = (state: Record<string, VoiceParticipant[]>) => {
      setVoiceStates(state || {});
    };

    // When a participant updates their mute status
    const handleUserMuted = (payload: {
      userId: string;
      socketId: string;
      isMuted: boolean;
    }) => {
      setVoiceParticipants((prev) =>
        prev.map((p) =>
          p.socketId === payload.socketId ? { ...p, isMuted: payload.isMuted } : p
        )
      );
    };

    // When a participant leaves
    const handleUserLeft = (payload: {
      channelSlug: string;
      userId: string;
      socketId: string;
    }) => {
      const pc = peersRef.current.get(payload.socketId);
      if (pc) {
        pc.close();
        peersRef.current.delete(payload.socketId);
      }
      const audio = audioElementsRef.current.get(payload.socketId);
      if (audio) {
        audio.srcObject = null;
        audio.remove();
        audioElementsRef.current.delete(payload.socketId);
      }
      setVoiceParticipants((prev) => prev.filter((p) => p.socketId !== payload.socketId));
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
  }, [socket, createPeerConnection]);

  // Clean up on window unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentVoiceChannel && socket) {
        socket.emit("voice:leave");
      }
      cleanupVoiceSession();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      cleanupVoiceSession();
    };
  }, [cleanupVoiceSession, currentVoiceChannel, socket]);

  // Merge local speaking status into voiceParticipants for UI
  const participantsWithSpeaking = voiceParticipants.map((p) => {
    if (p.isSelf) {
      return { ...p, isSpeaking: selfSpeaking && !isMuted };
    }
    return p;
  });

  return (
    <VoiceContext.Provider
      value={{
        currentVoiceChannel,
        isInVoice: Boolean(currentVoiceChannel),
        isConnecting,
        isMuted,
        isDeafened,
        isListenOnly,
        voiceError,
        voiceParticipants: participantsWithSpeaking,
        voiceCounts,
        voiceStates,
        joinVoice,
        leaveVoice,
        toggleMute,
        toggleDeafen,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
};
