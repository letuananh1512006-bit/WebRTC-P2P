import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { RoomManager } from "./room-manager.js";
import { attachSignaling } from "./signaling.js";

const PORT = Number(process.env.PORT) || 3000;

const rooms = new RoomManager();
const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", service: "webrtc-signaling" }));
});

const wss = new WebSocketServer({ server: httpServer });
attachSignaling(wss, rooms);

httpServer.listen(PORT, () => {
  console.log(`WebRTC signaling server listening on ws://localhost:${PORT}`);
});
