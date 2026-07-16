import { Kafka, Producer } from "kafkajs";
import fs from 'fs';
import path from 'path';
import { log } from "console";
import prismaClient from "./prisma";

const caCert = process.env.KAFKA_CA_CERT
    || (fs.existsSync(path.resolve("./ca.pem"))
        ? fs.readFileSync(path.resolve("./ca.pem"), "utf-8")
        : "");

const kafka = new Kafka({
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
    ssl: {
        ca: [caCert],
    },
    sasl: {
        username: process.env.KAFKA_USER || 'avnadmin',
        password: process.env.KAFKA_PASSWORD || '',
        mechanism: "plain",
    },
});

let producer: null | Producer = null;


export async function createProducer() {
    // so that it doesn't create a new producer everytime
    if(producer) return producer;

    const _producer = kafka.producer();
    await _producer.connect();

    producer = _producer;

    return producer;
}

export async function produceMesage(message: string) {
    const producer = await createProducer();

    await producer.send({
        messages: [{ key: `message-${Date.now()}`, value: message }],
        topic: "MESSAGES",
    })
    return true;
}

export async function messageConsumer() {
    console.log("Consumer is running")
    const consumer = kafka.consumer({ groupId: "default" });
    await consumer.connect();
    await consumer.subscribe({ topic: "MESSAGES", fromBeginning: true });

    await consumer.run({
        autoCommit: true, 
        eachMessage: async ({message, pause}) => {
            console.log("New message rec..");
            if(!message.value) return;
            try {
                await prismaClient.message.create({
                    data: {
                        text: message.value?.toString(),
                    },
                });
            } catch (error) {
                console.log("Something wrong with DB");
                pause();
                // if any issue with DB pause it for a min and then resume
                setTimeout(() => {
                    consumer.resume([{ topic: "MESSAGES" }]);
                }, 60*1000);
            }
        }
    })
}

export default kafka;