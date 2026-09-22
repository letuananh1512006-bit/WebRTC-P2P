"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = require("node:http");
const ws_1 = require("ws");
const room_manager_js_1 = require("./room-manager.js");
const signaling_js_1 = require("./signaling.js");
const PORT = Number(process.env.PORT) || 3000;
const rooms = new room_manager_js_1.RoomManager();
const httpServer = (0, node_http_1.createServer)((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "webrtc-signaling" }));
});
const wss = new ws_1.WebSocketServer({ server: httpServer });
(0, signaling_js_1.attachSignaling)(wss, rooms);
httpServer.listen(PORT, () => {
    console.log(`WebRTC signaling server listening on ws://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map