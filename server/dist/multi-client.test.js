"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_http_1 = require("node:http");
const ws_1 = require("ws");
const room_manager_js_1 = require("./room-manager.js");
const signaling_js_1 = require("./signaling.js");
const PORT = 3000;
const URL = `ws://localhost:${PORT}`;
class MessageQueue {
    pending = [];
    waiters = [];
    constructor(socket) {
        socket.on("message", (raw) => {
            const value = JSON.parse(String(raw));
            const waiter = this.waiters.shift();
            if (waiter) {
                waiter(value);
            }
            else {
                this.pending.push(value);
            }
        });
    }
    next(timeoutMs = 4000) {
        if (this.pending.length > 0) {
            return Promise.resolve(this.pending.shift());
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Timed out waiting for message")), timeoutMs);
            this.waiters.push((value) => {
                clearTimeout(timer);
                resolve(value);
            });
        });
    }
}
function connect(url) {
    return new Promise((resolve, reject) => {
        const socket = new ws_1.WebSocket(url);
        socket.once("open", () => resolve(socket));
        socket.once("error", reject);
    });
}
function join(socket, roomId, peerId) {
    socket.send(JSON.stringify({ type: "JOIN_ROOM", roomId, peerId }));
}
function offer(socket, toPeerId, sdp, extra = {}) {
    socket.send(JSON.stringify({
        type: "OFFER",
        roomId: "demo",
        toPeerId,
        sdp,
        ...extra,
    }));
}
function answer(socket, toPeerId, sdp) {
    socket.send(JSON.stringify({ type: "ANSWER", roomId: "demo", toPeerId, sdp }));
}
function ice(socket, toPeerId, candidate) {
    socket.send(JSON.stringify({
        type: "ICE_CANDIDATE",
        roomId: "demo",
        toPeerId,
        candidate,
        sdpMid: "0",
        sdpMLineIndex: 0,
    }));
}
function closeSocket(socket) {
    if (socket.readyState === ws_1.WebSocket.CLOSED) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        socket.once("close", () => resolve());
        socket.close();
        setTimeout(resolve, 1000);
    });
}
async function startServer() {
    const rooms = new room_manager_js_1.RoomManager();
    const httpServer = (0, node_http_1.createServer)((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", service: "webrtc-signaling" }));
    });
    const wss = new ws_1.WebSocketServer({ server: httpServer });
    (0, signaling_js_1.attachSignaling)(wss, rooms);
    await new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(PORT, () => resolve());
    });
    return {
        close: async () => {
            await new Promise((resolve) => wss.close(() => resolve()));
            await new Promise((resolve, reject) => {
                httpServer.close((err) => (err ? reject(err) : resolve()));
            });
        },
    };
}
async function run() {
    const server = await startServer();
    const clients = [];
    try {
        const a = await connect(URL);
        const b = await connect(URL);
        const c = await connect(URL);
        const d = await connect(URL);
        const e = await connect(URL);
        clients.push(a, b, c, d, e);
        const qa = new MessageQueue(a);
        const qb = new MessageQueue(b);
        const qc = new MessageQueue(c);
        const qd = new MessageQueue(d);
        const qe = new MessageQueue(e);
        join(a, "demo", "A");
        const aJoined = await qa.next();
        strict_1.default.equal(aJoined.type, "ROOM_JOINED");
        strict_1.default.equal(aJoined.roomId, "demo");
        strict_1.default.equal(aJoined.peerId, "A");
        strict_1.default.deepEqual(aJoined.peers, []);
        join(b, "demo", "B");
        const bJoined = await qb.next();
        const aSawB = await qa.next();
        strict_1.default.equal(bJoined.type, "ROOM_JOINED");
        strict_1.default.equal(bJoined.peerId, "B");
        strict_1.default.ok(bJoined.peers.includes("A"));
        strict_1.default.equal(aSawB.type, "USER_JOINED");
        strict_1.default.equal(aSawB.peerId, "B");
        join(c, "demo", "C");
        const cJoined = await qc.next();
        const aSawC = await qa.next();
        const bSawC = await qb.next();
        strict_1.default.equal(cJoined.type, "ROOM_JOINED");
        strict_1.default.deepEqual(cJoined.peers.sort(), ["A", "B"]);
        strict_1.default.equal(aSawC.type, "USER_JOINED");
        strict_1.default.equal(aSawC.peerId, "C");
        strict_1.default.equal(bSawC.type, "USER_JOINED");
        strict_1.default.equal(bSawC.peerId, "C");
        join(d, "demo", "D");
        const dJoined = await qd.next();
        const aSawD = await qa.next();
        const bSawD = await qb.next();
        const cSawD = await qc.next();
        strict_1.default.equal(dJoined.type, "ROOM_JOINED");
        strict_1.default.deepEqual(dJoined.peers.sort(), ["A", "B", "C"]);
        strict_1.default.equal(aSawD.peerId, "D");
        strict_1.default.equal(bSawD.peerId, "D");
        strict_1.default.equal(cSawD.peerId, "D");
        offer(a, "B", "offer-ab");
        const offerAb = await qb.next();
        strict_1.default.equal(offerAb.type, "OFFER");
        strict_1.default.equal(offerAb.fromPeerId, "A");
        strict_1.default.equal(offerAb.toPeerId, "B");
        strict_1.default.equal(offerAb.sdp, "offer-ab");
        offer(a, "C", "offer-ac");
        const offerAc = await qc.next();
        strict_1.default.equal(offerAc.type, "OFFER");
        strict_1.default.equal(offerAc.fromPeerId, "A");
        strict_1.default.equal(offerAc.toPeerId, "C");
        offer(a, "D", "offer-ad");
        const offerAd = await qd.next();
        strict_1.default.equal(offerAd.type, "OFFER");
        strict_1.default.equal(offerAd.fromPeerId, "A");
        strict_1.default.equal(offerAd.toPeerId, "D");
        answer(b, "A", "answer-ba");
        answer(c, "A", "answer-ca");
        answer(d, "A", "answer-da");
        const answers = [await qa.next(), await qa.next(), await qa.next()];
        strict_1.default.equal(answers.length, 3);
        strict_1.default.ok(answers.every((msg) => msg.type === "ANSWER" && msg.toPeerId === "A"));
        strict_1.default.deepEqual(answers.map((msg) => msg.fromPeerId).sort(), ["B", "C", "D"]);
        strict_1.default.deepEqual(answers.map((msg) => msg.sdp).sort(), ["answer-ba", "answer-ca", "answer-da"]);
        ice(a, "B", "ice-ab");
        const iceAb = await qb.next();
        strict_1.default.equal(iceAb.type, "ICE_CANDIDATE");
        strict_1.default.equal(iceAb.fromPeerId, "A");
        strict_1.default.equal(iceAb.candidate, "ice-ab");
        ice(b, "C", "ice-bc");
        const iceBc = await qc.next();
        strict_1.default.equal(iceBc.type, "ICE_CANDIDATE");
        strict_1.default.equal(iceBc.fromPeerId, "B");
        strict_1.default.equal(iceBc.candidate, "ice-bc");
        ice(c, "D", "ice-cd");
        const iceCd = await qd.next();
        strict_1.default.equal(iceCd.type, "ICE_CANDIDATE");
        strict_1.default.equal(iceCd.fromPeerId, "C");
        strict_1.default.equal(iceCd.candidate, "ice-cd");
        ice(d, "A", "ice-da");
        const iceDa = await qa.next();
        strict_1.default.equal(iceDa.type, "ICE_CANDIDATE");
        strict_1.default.equal(iceDa.fromPeerId, "D");
        strict_1.default.equal(iceDa.candidate, "ice-da");
        a.send(JSON.stringify({
            type: "OFFER",
            roomId: "demo",
            fromPeerId: "FAKE",
            toPeerId: "B",
            sdp: "test-sdp",
        }));
        const spoofed = await qb.next();
        strict_1.default.equal(spoofed.type, "OFFER");
        strict_1.default.equal(spoofed.fromPeerId, "A");
        strict_1.default.notEqual(spoofed.fromPeerId, "FAKE");
        strict_1.default.equal(spoofed.sdp, "test-sdp");
        join(e, "other", "E");
        const eJoined = await qe.next();
        strict_1.default.equal(eJoined.type, "ROOM_JOINED");
        strict_1.default.equal(eJoined.roomId, "other");
        strict_1.default.deepEqual(eJoined.peers, []);
        a.send(JSON.stringify({
            type: "OFFER",
            roomId: "other",
            toPeerId: "E",
            sdp: "cross-room",
        }));
        const crossRoom = await qa.next();
        strict_1.default.equal(crossRoom.type, "ERROR");
        strict_1.default.equal(crossRoom.message, "roomId does not match current room");
        const aLeft = qa.next();
        const bLeft = qb.next();
        const cLeft = qc.next();
        d.close();
        const leftA = await aLeft;
        const leftB = await bLeft;
        const leftC = await cLeft;
        strict_1.default.ok([leftA, leftB, leftC].every((msg) => msg.type === "USER_LEFT" && msg.peerId === "D" && msg.roomId === "demo"));
    }
    finally {
        await Promise.all(clients.map((socket) => closeSocket(socket)));
        await server.close();
    }
}
run()
    .then(() => {
    console.log("Multi-client WebSocket test passed (A, B, C, D, E on ws://localhost:3000).");
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=multi-client.test.js.map