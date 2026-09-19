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

  const localStreamRef = useRef<MediaStream | null>(null);
  const webrtcRef = useRef(new WebRTCMeshService());
  const audioDetectorRef = useRef(new AudioActivityDetector());
  const isDeafenedRef = useRef(isDeafened);
  isDeafenedRef.current = isDeafened;

  const cleanupVoiceSession = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    webrtcRef.current.cleanup();
    audioDetectorRef.current.stop();

    setVoiceParticipants([]);
    setCurrentVoiceChannel(null);
    setIsConnecting(false);
    setIsListenOnly(false);
    setSelfSpeaking(false);
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
          listenOnly = true;
          setVoiceError("Microphone unavailable or blocked. Connected in Listen-Only mode.");
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
    [socket, currentUser, currentVoiceChannel, leaveVoice]
  );

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

  const toggleDeafen = useCallback(() => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);
    isDeafenedRef.current = nextDeafened;
    webrtcRef.current.setDeafened(nextDeafened);

    if (nextDeafened && !isMuted) {
      toggleMute();
    }
  }, [isDeafened, isMuted, toggleMute]);

  // Hook handles all socket events for voice
  useVoiceSocket({
    socket,
    webrtcRef,
    localStreamRef,
    isDeafenedRef,
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
