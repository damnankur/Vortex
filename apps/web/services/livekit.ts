import {
  Room,
  RoomEvent,
  RemoteTrack,
  Track,
  Participant,
} from "livekit-client";

export interface LiveKitServiceEvents {
  onSpeakingChanged?: (speakingUserIds: string[]) => void;
  onAutoplayBlocked?: () => void;
  onDisconnected?: () => void;
}

export class LiveKitVoiceService {
  private room: Room | null = null;
  private attachedElements = new Set<HTMLMediaElement>();
  private isDeafened = false;
  private events: LiveKitServiceEvents = {};

  constructor(events: LiveKitServiceEvents = {}) {
    this.events = events;
  }

  public setEvents(events: LiveKitServiceEvents): void {
    this.events = { ...this.events, ...events };
  }

  public async connect(url: string, token: string): Promise<Room> {
    if (this.room) {
      await this.disconnect();
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.room = room;

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.muted = this.isDeafened;
        this.attachedElements.add(el);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      const detached = track.detach();
      detached.forEach((el) => {
        this.attachedElements.delete(el);
        el.remove();
      });
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const speakerIds = speakers.map((s) => s.identity);
      this.events.onSpeakingChanged?.(speakerIds);
    });

    room.on(RoomEvent.AudioPlaybackStatusChanged, (isPlaying: boolean) => {
      if (!isPlaying && !room.canPlaybackAudio) {
        this.events.onAutoplayBlocked?.();
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      this.events.onDisconnected?.();
    });

    await room.connect(url, token);

    if (!room.canPlaybackAudio) {
      this.events.onAutoplayBlocked?.();
    }

    return room;
  }

  public async setMicrophoneEnabled(enabled: boolean): Promise<boolean> {
    if (!this.room) return false;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(enabled);
      return true;
    } catch (err) {
      console.warn("LiveKit setMicrophoneEnabled error:", err);
      return false;
    }
  }

  public setDeafened(deafened: boolean): void {
    this.isDeafened = deafened;
    this.attachedElements.forEach((el) => {
      el.muted = deafened;
    });
  }

  public async unlockAudio(): Promise<void> {
    if (this.room) {
      try {
        await this.room.startAudio();
      } catch (err) {
        console.warn("LiveKit startAudio unlock error:", err);
      }
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.room) return;
    try {
      await this.room.disconnect();
    } catch {
      // Ignored during cleanup
    } finally {
      this.attachedElements.forEach((el) => el.remove());
      this.attachedElements.clear();
      this.room = null;
    }
  }

  public isConnected(): boolean {
    return Boolean(this.room && this.room.state === "connected");
  }
}
