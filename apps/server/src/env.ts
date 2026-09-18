import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((s) => s.startsWith("postgresql://"), "DATABASE_URL must be a postgresql:// URL"),

  REDIS_HOST: z.string().min(1, "REDIS_HOST is required"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_USER: z.string().default("default"),
  REDIS_PASSWORD: z.string().default(""),

  KAFKA_BROKER: z.string().min(1, "KAFKA_BROKER is required"),
  KAFKA_USER: z.string().default(""),
  KAFKA_PASSWORD: z.string().default(""),
  KAFKA_CA_CERT: z.string().optional(),
  KAFKA_CONSUMER_GROUP: z.string().default("vortex-messages"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  DEFAULT_ROOM_SLUG: z.string().default("general"),
  CHANNELS: z.string().default("general,gaming,music,tech,watercooler"),
  MESSAGE_MAX_LENGTH: z.coerce.number().int().positive().default(2000),
  TYPING_THROTTLE_MS: z.coerce.number().int().positive().default(2000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(10000),
  MAX_CONNECTIONS: z.coerce.number().int().positive().default(1000),
});

const envSchemaRefined = envSchema.superRefine((val, ctx) => {
  if (val.NODE_ENV !== "production") return;

  if (!val.KAFKA_CA_CERT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["KAFKA_CA_CERT"],
      message: "KAFKA_CA_CERT is required in production (TLS is enforced)",
    });
  }
  if (!val.REDIS_PASSWORD) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REDIS_PASSWORD"],
      message: "REDIS_PASSWORD is required in production",
    });
  }
  if (!val.KAFKA_USER || !val.KAFKA_PASSWORD) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["KAFKA_USER"],
      message: "KAFKA_USER and KAFKA_PASSWORD are required in production",
    });
  }
});

const parsed = envSchemaRefined.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const [key, messages] of Object.entries(parsed.error.flatten().fieldErrors)) {
    console.error(`  - ${key}: ${messages?.join(", ")}`);
  }
  process.exit(1);
}

export const env = parsed.data;

export const channelSlugs = env.CHANNELS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isKnownChannel(slug: string): boolean {
  return channelSlugs.includes(slug);
}
