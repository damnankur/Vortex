import { Kafka, Producer, Consumer } from "kafkajs";
import { env } from "../env";
import prisma from "./prisma";
import { logger } from "../lib/logger";

const caCert = env.KAFKA_CA_CERT ? env.KAFKA_CA_CERT.replace(/\\n/g, "\n") : "";

const kafka = new Kafka({
  clientId: "vortex-server",
  brokers: [env.KAFKA_BROKER],
  ssl: caCert ? { ca: [caCert], rejectUnauthorized: true } : undefined,
  sasl:
    env.KAFKA_USER && env.KAFKA_PASSWORD
      ? {
          username: env.KAFKA_USER,
          password: env.KAFKA_PASSWORD,
          mechanism: "plain" as const,
        }
      : undefined,
  connectionTimeout: 5000,
  retry: { initialRetryTime: 1000, retries: 5 },
});

let producer: Producer | null = null;

export async function getProducer(): Promise<Producer> {
  if (producer) return producer;
  const p = kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
  await p.connect();
  producer = p;
  return producer;
}

export async function produceMessage(key: string, value: string): Promise<boolean> {
  try {
    const p = await getProducer();
    await p.send({
      topic: "MESSAGES",
      messages: [{ key, value }],
    });
    return true;
  } catch (err) {
    logger.error({ err }, "kafka produce error");
    return false;
  }
}

export async function disconnectProducer() {
  if (producer) {
    await producer.disconnect().catch(() => undefined);
    producer = null;
  }
}

export async function startMessageConsumer(): Promise<Consumer> {
  const consumer = kafka.consumer({ groupId: env.KAFKA_CONSUMER_GROUP });
  await consumer.connect();
  await consumer.subscribe({ topic: "MESSAGES", fromBeginning: false });

  await consumer.run({
    autoCommit: true,
    eachMessage: async ({ message }) => {
      const messageId = message.key?.toString();
      const value = message.value?.toString();
      if (!messageId || !value) return;

      try {
        const data = JSON.parse(value) as {
          text: string;
          roomId: string;
          userId?: string;
        };

        await prisma.message.upsert({
          where: { messageId },
          create: {
            messageId,
            text: data.text,
            roomId: data.roomId,
            userId: data.userId,
          },
          update: {},
        });
      } catch (err) {
        // Re-throw so Kafka redelivers on transient failures.
        logger.error({ err }, "failed to persist message");
        throw err;
      }
    },
  });

  return consumer;
}

export default kafka;
