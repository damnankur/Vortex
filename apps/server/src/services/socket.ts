import { Server } from "socket.io"
import Redis from "ioredis"
import { produceMesage } from "./kafka";

const publisher = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    username: process.env.REDIS_USER || 'default',
    password: process.env.REDIS_PASSWORD || ''
});

const subscriber = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    username: process.env.REDIS_USER || 'default',
    password: process.env.REDIS_PASSWORD || ''
});

class SocketService {
    private _io: Server;

    constructor(){
        console.log("Socket Server init");
        this._io = new Server({
            cors: {
                allowedHeaders: ["*"],
                origin: "*",
            }
        });
        // subscribing to the message channel so that 
        // so that all client connected to the server can receive the messages
        subscriber.subscribe("MESSAGES")
    }
    
    public socketListeners(){
        const io = this.io;
        console.log("Init the socket listeners");
        // when we connect to the socket
        io.on("connect", (socket) => {
            console.log("New socket connection", socket.id);
            socket.on("event: message", async({ message } : { message: String}) => {
                console.log("New Message Received on server", message);
                await publisher.publish("MESSAGES", JSON.stringify({ message }));
            });
            socket.on("disconnect", (reason) => {
                console.log("Socket disconnected:", socket.id, reason);
            });
        });

        // if redis rec msg then we check the channel and 
        // forward all the messages as it is to the client
        subscriber.on('message', async (channel, message) => {
            if(channel === 'MESSAGES'){
                console.log("new message from redis", message);
                io.emit("message", message)
                // send to kafka instead of storing it in DB
                await produceMesage(message);
                console.log("Message Produced into Kafka Broker")
            }
        })
    }

    get io(){
        return this._io;
    }
}

export default SocketService;