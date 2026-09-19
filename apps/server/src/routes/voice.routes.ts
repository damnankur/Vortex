import { Router } from "express";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";
import { authRequired, AuthRequest } from "../middleware/auth.middleware";
import { env } from "../env";
import { logger } from "../lib/logger";

export const voiceRouter = Router();

const tokenRequestSchema = z.object({
  channelSlug: z.string().min(1),
});

voiceRouter.post("/token", authRequired, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
    return res.status(503).json({
      error: "LiveKit is not configured on this server.",
      available: false,
    });
  }

  const parsed = tokenRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid payload" });
  }

  const { channelSlug } = parsed.data;

  try {
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: user.userId,
      name: user.username,
    });

    at.addGrant({
      roomJoin: true,
      room: `vortex-voice-${channelSlug}`,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return res.json({
      token,
      url: env.LIVEKIT_URL,
      room: `vortex-voice-${channelSlug}`,
      identity: user.userId,
      name: user.username,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to generate LiveKit token");
    return res.status(500).json({ error: "Failed to generate voice token" });
  }
});
