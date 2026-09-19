const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export class WebRTCMeshService {
  private peers = new Map<string, RTCPeerConnection>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private audioElements = new Map<string, HTMLAudioElement>();

  public getPeer(socketId: string): RTCPeerConnection | undefined {
    return this.peers.get(socketId);
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
      let audio = this.audioElements.get(targetSocketId);
      if (!audio) {
        audio = document.createElement("audio");
        audio.autoplay = true;
        audio.muted = isDeafened;
        document.body.appendChild(audio);
        this.audioElements.set(targetSocketId, audio);
      }
      audio.srcObject = event.streams[0] || null;
      audio.play().catch(() => undefined);
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        this.removePeer(targetSocketId);
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
    const audio = this.audioElements.get(socketId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      this.audioElements.delete(socketId);
    }
    this.pendingCandidates.delete(socketId);
  }

  public cleanup() {
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();

    this.audioElements.forEach((audio) => {
      audio.srcObject = null;
      audio.remove();
    });
    this.audioElements.clear();
    this.pendingCandidates.clear();
  }
}
