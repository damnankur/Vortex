import { Server, Socket } from "socket.io";
import { z } from "zod";
import { logger } from "../../lib/logger";

export interface VoiceUser {
  userId: string;
  username: string;
  socketId: string;
  isMuted?: boolean;
}

export class VoiceHandler {
  // channelSlug -> (userId -> VoiceUser)
  private voiceRooms = new Map<string, Map<string, VoiceUser>>();
  // socketId -> channelSlug
  private socketToVoiceRoom = new Map<string, string>();

  public getVoiceCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [channelSlug, users] of this.voiceRooms.entries()) {
      if (users.size > 0) {
        counts[channelSlug] = users.size;
      }
    }
    return counts;
  }

  public getVoiceState(): Record<string, VoiceUser[]> {
    const state: Record<string, VoiceUser[]> = {};
    for (const [channelSlug, users] of this.voiceRooms.entries()) {
      if (users.size > 0) {
        state[channelSlug] = Array.from(users.values());
      }
    }
    return state;
  }

  public broadcastVoiceCounts(io: Server) {
    io.emit("voice:counts", this.getVoiceCounts());
    io.emit("voice:state", this.getVoiceState());
  }

  public handleLeaveVoice(
    io: Server,
    socket: Socket,
    user: { userId: string; username: string }
  ) {
    const channelSlug = this.socketToVoiceRoom.get(socket.id);
    if (!channelSlug) return;

    this.socketToVoiceRoom.delete(socket.id);
    const room = this.voiceRooms.get(channelSlug);
    if (room) {
      room.delete(user.userId);
      if (room.size === 0) {
        this.voiceRooms.delete(channelSlug);
      }
    }

    socket.leave(`voice:${channelSlug}`);
    io.to(`voice:${channelSlug}`).emit("voice:user-left", {
      channelSlug,
      userId: user.userId,
      socketId: socket.id,
    });
    this.broadcastVoiceCounts(io);
    logger.info({ userId: user.userId, channelSlug }, "User left voice channel");
  }

  public registerEvents(
    io: Server,
    socket: Socket,
    user: { userId: string; username: string }
  ) {
    socket.on("voice:join", (payload: unknown) => {
      const parsed = z
        .object({ channelSlug: z.string().trim().min(1).max(50) })
        .safeParse(payload);
      if (!parsed.success) return;
      const channelSlug = parsed.data.channelSlug;

      this.handleLeaveVoice(io, socket, user);

      let room = this.voiceRooms.get(channelSlug);
      if (!room) {
        room = new Map();
        this.voiceRooms.set(channelSlug, room);
      }

      const voiceUser: VoiceUser = {
        userId: user.userId,
        username: user.username,
        socketId: socket.id,
        isMuted: false,
      };

      const existingPeers = Array.from(room.values());
      room.set(user.userId, voiceUser);
      this.socketToVoiceRoom.set(socket.id, channelSlug);
      socket.join(`voice:${channelSlug}`);

      socket.emit("voice:room-users", {
        channelSlug,
        users: existingPeers,
      });

      socket.to(`voice:${channelSlug}`).emit("voice:user-joined", {
        channelSlug,
        user: voiceUser,
      });

      this.broadcastVoiceCounts(io);
      logger.info({ userId: user.userId, channelSlug }, "User joined voice channel");
    });

    socket.on("voice:signal", (payload: unknown) => {
      const parsed = z
        .object({
          targetSocketId: z.string().min(1),
          signal: z.unknown(),
        })
        .safeParse(payload);
      if (!parsed.success) return;

      io.to(parsed.data.targetSocketId).emit("voice:signal", {
        senderSocketId: socket.id,
        senderUserId: user.userId,
        senderUsername: user.username,
        signal: parsed.data.signal,
      });
    });

    socket.on("voice:mute", (payload: unknown) => {
      const parsed = z.object({ isMuted: z.boolean() }).safeParse(payload);
      if (!parsed.success) return;

      const channelSlug = this.socketToVoiceRoom.get(socket.id);
      if (!channelSlug) return;

      const room = this.voiceRooms.get(channelSlug);
      const voiceUser = room?.get(user.userId);
      if (voiceUser) {
        voiceUser.isMuted = parsed.data.isMuted;
      }

      io.to(`voice:${channelSlug}`).emit("voice:user-muted", {
        channelSlug,
        userId: user.userId,
        socketId: socket.id,
        isMuted: parsed.data.isMuted,
      });
      this.broadcastVoiceCounts(io);
    });

    socket.on("voice:leave", () => {
      this.handleLeaveVoice(io, socket, user);
    });
  }
}
