import { Server } from "socket.io";
import type { PresenceUser } from "../../types";

export class PresenceManager {
  private onlineUsers = new Map<string, PresenceUser>();

  public roster(): PresenceUser[] {
    return Array.from(this.onlineUsers.values()).sort((a, b) =>
      a.username.localeCompare(b.username)
    );
  }

  public addPresence(user: { userId: string; username: string }) {
    this.onlineUsers.set(user.userId, {
      ...user,
      connectedAt: new Date().toISOString(),
    });
  }

  public removePresence(userId: string) {
    this.onlineUsers.delete(userId);
  }

  public broadcastPresence(io: Server, roomId: string) {
    io.to(roomId).emit("presence", { roomId, users: this.roster() });
  }
}
