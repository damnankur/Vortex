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
import { WebRTCMeshService } from "../services/webrtc";
import { AudioActivityDetector } from "../services/audioActivity";
import { LiveKitVoiceService } from "../services/livekit";
import { useVoiceSocket } from "../hooks/useVoiceSocket";

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
  autoplayBlocked: boolean;
  voiceParticipants: VoiceParticipant[];
  voiceCounts: Record<string, number>;
  voiceStates: Record<string, VoiceParticipant[]>;
  joinVoice: (channelSlug: string) => Promise<void>;
  leaveVoice: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  unlockAudio: () => void;
}

const VoiceContext = createContext<IVoiceContext | null>(null);

export const useVoice = () => {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within a VoiceProvider");
  return ctx;
};

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket, currentUser } = useSocket();

  const [currentVoiceChannel, setCurrentVoiceChannel] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isListenOnly, setIsListenOnly] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([]);
  const [voiceCounts, setVoiceCounts] = useState<Record<string, number>>({});
  const [voiceStates, setVoiceStates] = useState<Record<string, VoiceParticipant[]>>({});
  const [selfSpeaking, setSelfSpeaking] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const webrtcRef = useRef(new WebRTCMeshService());
  const livekitRef = useRef(new LiveKitVoiceService());
  const isLiveKitActiveRef = useRef(false);
  const audioDetectorRef = useRef(new AudioActivityDetector());
  const isDeafenedRef = useRef(isDeafened);
  isDeafenedRef.current = isDeafened;

  const unlockAudio = useCallback(() => {
    webrtcRef.current.unlockAudioContext();
    livekitRef.current.unlockAudio();
    setAutoplayBlocked(false);
  }, []);

  useEffect(() => {
    webrtcRef.current.onAutoplayBlocked = () => setAutoplayBlocked(true);
    livekitRef.current.setEvents({
      onAutoplayBlocked: () => setAutoplayBlocked(true),
      onSpeakingChanged: (speakerIds) => {
        setVoiceParticipants((prev) =>
          prev.map((p) => {
            if (p.isSelf) return p;
            return { ...p, isSpeaking: speakerIds.includes(p.userId) };
          })
        );
      },
    });
  }, []);

  const cleanupVoiceSession = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    livekitRef.current.disconnect();
    isLiveKitActiveRef.current = false;
    webrtcRef.current.cleanup();
    audioDetectorRef.current.stop();

    setVoiceParticipants([]);
    setCurrentVoiceChannel(null);
    setIsConnecting(false);
    setIsListenOnly(false);
    setSelfSpeaking(false);
    setAutoplayBlocked(false);
  }, []);

  const leaveVoice = useCallback(() => {
    if (socket && currentVoiceChannel) {
      socket.emit("voice:leave");
    }
    cleanupVoiceSession();
  }, [cleanupVoiceSession, currentVoiceChannel, socket]);

  const joinVoice = useCallback(
    async (channelSlug: string) => {
      if (!socket || !currentUser) {
        setVoiceError("You must be authenticated to connect to voice channels.");
        return;
      }
      if (currentVoiceChannel === channelSlug) return;
      if (currentVoiceChannel) leaveVoice();

      unlockAudio();
      setIsConnecting(true);
      setVoiceError(null);

      let stream: MediaStream | null = null;
      let listenOnly = false;

      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          } catch (micErr: unknown) {
            listenOnly = true;
            const msg = micErr instanceof Error ? micErr.message : "Microphone access denied.";
            setVoiceError(`${msg} Connected in Listen-Only mode.`);
          }
        }
      } else {
        listenOnly = true;
        setVoiceError("Microphone not supported on this device. Connected in Listen-Only mode.");
      }

      setIsListenOnly(listenOnly);
      if (stream) {
        localStreamRef.current = stream;
        audioDetectorRef.current.start(stream, setSelfSpeaking);
      } else {
        localStreamRef.current = null;
      }

      // Connect to LiveKit Cloud SFU
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("vortex_token") : null;
        const baseUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";
        const res = await fetch(`${baseUrl}/voice/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ channelSlug }),
        });

        if (res.ok) {
          const data = (await res.json()) as { token: string; url: string };
          if (data.token && data.url) {
            await livekitRef.current.connect(data.url, data.token);
            if (!listenOnly) {
              await livekitRef.current.setMicrophoneEnabled(true);
            }
            isLiveKitActiveRef.current = true;
          }
        }
      } catch (lkErr) {
        console.warn("LiveKit connection failed, falling back to WebRTC mesh:", lkErr);
        isLiveKitActiveRef.current = false;
      }

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
      socket.emit("voice:join", { channelSlug });
      setIsConnecting(false);
    },
    [socket, currentUser, currentVoiceChannel, leaveVoice, unlockAudio]
  );

  const toggleMute = useCallback(() => {
    if (isListenOnly) {
      setVoiceError("Microphone input is not available in Listen-Only mode.");
      return;
    }
    const nextMuted = !isMuted;
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted;
      });
    }
    if (isLiveKitActiveRef.current) {
      livekitRef.current.setMicrophoneEnabled(!nextMuted);
    }
    setIsMuted(nextMuted);

    if (socket) {
      socket.emit("voice:mute", { isMuted: nextMuted });
    }
    setVoiceParticipants((prev) =>
      prev.map((p) => (p.isSelf ? { ...p, isMuted: nextMuted } : p))
    );
  }, [isListenOnly, isMuted, socket]);

  const toggleDeafen = useCallback(() => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);
    isDeafenedRef.current = nextDeafened;
    livekitRef.current.setDeafened(nextDeafened);
    webrtcRef.current.setDeafened(nextDeafened);

    if (nextDeafened && !isMuted) {
      toggleMute();
    }
  }, [isDeafened, isMuted, toggleMute]);

  useVoiceSocket({
    socket,
    webrtcRef,
    localStreamRef,
    isDeafenedRef,
    isLiveKitActiveRef,
    setVoiceCounts,
    setVoiceStates,
    setVoiceParticipants,
  });

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

  const participantsWithSpeaking = voiceParticipants.map((p) => ({
    ...p,
    isSpeaking: p.isSelf ? selfSpeaking && !isMuted : p.isSpeaking,
  }));

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
        autoplayBlocked,
        voiceParticipants: participantsWithSpeaking,
        voiceCounts,
        voiceStates,
        joinVoice,
        leaveVoice,
        toggleMute,
        toggleDeafen,
        unlockAudio,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
};
