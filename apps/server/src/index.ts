import http from "http";
import SocketService from "./services/socket";
import { messageConsumer } from "./services/kafka";

async function init() {
  const PORT = process.env.PORT ? process.env.PORT : 5000;

  // Start Kafka consumer (non-blocking, handles its own errors)
  messageConsumer().catch((err) => {
    console.error("Kafka consumer failed to start:", err.message);
  });

  // Start Socket.IO server
  const socketService = new SocketService();
  const httpServer = http.createServer();
  socketService.io.attach(httpServer);

  httpServer.listen(PORT, () =>
    console.log(`HTTP Server started at PORT ${PORT}`)
  );

  socketService.socketListeners();
}

init().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
