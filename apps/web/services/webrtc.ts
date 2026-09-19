export interface PeerNegotiationState {
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: "stun:stun.cloudflare.com:3478" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
        "turns:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

export class WebRTCMeshService {
  private peers = new Map<string, RTCPeerConnection>();
  private negotiationStates = new Map<string, PeerNegotiationState>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private audioElements = new Map<string, HTMLAudioElement>();
  private audioCtx: AudioContext | null = null;
  private audioSourceNodes = new Map<string, MediaStreamAudioSourceNode>();
  public onAutoplayBlocked?: () => void;

  public unlockAudioContext(): void {
    try {
      if (!this.audioCtx || this.audioCtx.state === "closed") {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioCtxClass();
      }
      if (this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => undefined);
      }
      // Play a soft 80ms connection tone to confirm audio device & trigger Chrome tab speaker
      this.playTone(523.25, 0.08, 0.04);
      setTimeout(() => this.playTone(659.25, 0.1, 0.04), 90);
    } catch {
      // ignore
    }
  }

  public playTone(freq: number, duration: number, volume = 0.04): void {
    if (!this.audioCtx || this.audioCtx.state !== "running") return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch {
      // ignore
    }
  }

  public getPeer(socketId: string): RTCPeerConnection | undefined {
    return this.peers.get(socketId);
  }

  public getNegotiationState(socketId: string): PeerNegotiationState {
    let state = this.negotiationStates.get(socketId);
    if (!state) {
      state = {
        makingOffer: false,
        ignoreOffer: false,
        isSettingRemoteAnswerPending: false,
      };
      this.negotiationStates.set(socketId, state);
    }
    return state;
  }

  public createPeer(
    targetSocketId: string,
    localStream: MediaStream | null,
    isDeafened: boolean,
    onIceCandidate: (candidate: RTCIceCandidate) => void
  ): RTCPeerConnection {
    if (this.peers.has(targetSocketId)) {
      return this.peers.get(targetSocketId)!;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peers.set(targetSocketId, pc);

    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    } else {
      try {
        pc.addTransceiver("audio", { direction: "recvonly" });
      } catch {
        // ignore
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate(event.candidate);
      }
    };

    pc.ontrack = (event) => {
      const stream =
        event.streams && event.streams[0]
          ? event.streams[0]
          : new MediaStream([event.track]);

      let audio = this.audioElements.get(targetSocketId);
      if (!audio) {
        audio = document.createElement("audio");
        audio.autoplay = true;
        (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
        audio.muted = isDeafened;
        audio.volume = 1.0;
        document.body.appendChild(audio);
        this.audioElements.set(targetSocketId, audio);
      }
      audio.srcObject = stream;

      // Pipe through AudioContext destination if available
      if (this.audioCtx && this.audioCtx.state === "running") {
        try {
          if (!this.audioSourceNodes.has(targetSocketId)) {
            const node = this.audioCtx.createMediaStreamSource(stream);
            node.connect(this.audioCtx.destination);
            this.audioSourceNodes.set(targetSocketId, node);
          }
        } catch {
          // fallback to audio element
        }
      }

      audio.play().catch(() => {
        this.onAutoplayBlocked?.();
      });
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        pc.restartIce();
      }
    };

    return pc;
  }

  public async drainCandidates(socketId: string, pc: RTCPeerConnection) {
    const queued = this.pendingCandidates.get(socketId) || [];
    for (const cand of queued) {
      await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => undefined);
    }
    this.pendingCandidates.delete(socketId);
  }

  public queueCandidate(socketId: string, candidate: RTCIceCandidateInit) {
    const list = this.pendingCandidates.get(socketId) || [];
    list.push(candidate);
    this.pendingCandidates.set(socketId, list);
  }

  public setDeafened(deafened: boolean) {
    this.audioElements.forEach((audio) => {
      audio.muted = deafened;
    });
  }

  public removePeer(socketId: string) {
    const pc = this.peers.get(socketId);
    if (pc) {
      pc.close();
      this.peers.delete(socketId);
    }
    this.negotiationStates.delete(socketId);
    const audio = this.audioElements.get(socketId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      this.audioElements.delete(socketId);
    }
    const node = this.audioSourceNodes.get(socketId);
    if (node) {
      node.disconnect();
      this.audioSourceNodes.delete(socketId);
    }
    this.pendingCandidates.delete(socketId);
  }

  public cleanup() {
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();
    this.negotiationStates.clear();

    this.audioElements.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    this.audioElements.clear();

    this.audioSourceNodes.forEach((node) => node.disconnect());
    this.audioSourceNodes.clear();

    if (this.audioCtx && this.audioCtx.state !== "closed") {
      this.audioCtx.close().catch(() => undefined);
      this.audioCtx = null;
    }
    this.pendingCandidates.clear();
  }
}
