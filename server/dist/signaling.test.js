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
    next(timeoutMs = 3000) {
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
async function wait(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
async function withServer(run) {
    const rooms = new room_manager_js_1.RoomManager();
    const httpServer = (0, node_http_1.createServer)();
    const wss = new ws_1.WebSocketServer({ server: httpServer });
    (0, signaling_js_1.attachSignaling)(wss, rooms);
    await new Promise((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address();
    if (!address || typeof address === "string") {
        throw new Error("Failed to bind test server");
    }
    const url = `ws://127.0.0.1:${address.port}`;
    const sockets = [];
    try {
        await run(url, rooms);
    }
    finally {
        for (const socket of sockets) {
            socket.close();
        }
        wss.close();
        await new Promise((resolve, reject) => {
            httpServer.close((err) => (err ? reject(err) : resolve()));
        });
    }
}
async function runSignalingTests() {
    let passed = 0;
    await withServer(async (url, rooms) => {
        const a = await connect(url);
        const b = await connect(url);
        const c = await connect(url);
        const d = await connect(url);
        const outsider = await connect(url);
        const qa = new MessageQueue(a);
        const qb = new MessageQueue(b);
        const qc = new MessageQueue(c);
        const qd = new MessageQueue(d);
        const qo = new MessageQueue(outsider);
        a.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "demo", peerId: "A" }));
        const aJoined = await qa.next();
        strict_1.default.equal(aJoined.type, "ROOM_JOINED");
        strict_1.default.equal(aJoined.peerId, "A");
        strict_1.default.deepEqual(aJoined.peers, []);
        passed += 1;
        b.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "demo", peerId: "B" }));
        const bJoined = await qb.next();
        const aSawB = await qa.next();
        strict_1.default.equal(bJoined.type, "ROOM_JOINED");
        strict_1.default.deepEqual(bJoined.peers, ["A"]);
        strict_1.default.equal(aSawB.type, "USER_JOINED");
        strict_1.default.equal(aSawB.peerId, "B");
        passed += 1;
        c.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "demo", peerId: "C" }));
        const cJoined = await qc.next();
        strict_1.default.equal(cJoined.type, "ROOM_JOINED");
        strict_1.default.deepEqual(cJoined.peers.sort(), ["A", "B"]);
        strict_1.default.equal((await qa.next()).peerId, "C");
        strict_1.default.equal((await qb.next()).peerId, "C");
        passed += 1;
        d.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "demo", peerId: "D" }));
        const dJoined = await qd.next();
        strict_1.default.equal(dJoined.type, "ROOM_JOINED");
        await qa.next();
        await qb.next();
        await qc.next();
        strict_1.default.ok(dJoined.peers.includes("A"));
        outsider.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "other", peerId: "X" }));
        const xJoined = await qo.next();
        strict_1.default.equal(xJoined.type, "ROOM_JOINED");
        strict_1.default.deepEqual(xJoined.peers, []);
        a.send(JSON.stringify({ type: "OFFER", roomId: "demo", toPeerId: "B", sdp: "offer-ab" }));
        const offerAb = await qb.next();
        strict_1.default.equal(offerAb.type, "OFFER");
        strict_1.default.equal(offerAb.fromPeerId, "A");
        strict_1.default.equal(offerAb.toPeerId, "B");
        strict_1.default.equal(offerAb.sdp, "offer-ab");
        passed += 1;
        b.send(JSON.stringify({ type: "ANSWER", roomId: "demo", toPeerId: "A", sdp: "answer-ba" }));
        const answerBa = await qa.next();
        strict_1.default.equal(answerBa.type, "ANSWER");
        strict_1.default.equal(answerBa.fromPeerId, "B");
        strict_1.default.equal(answerBa.sdp, "answer-ba");
        passed += 1;
        a.send(JSON.stringify({
            type: "ICE_CANDIDATE",
            roomId: "demo",
            toPeerId: "B",
            candidate: "ice-ab",
            sdpMid: "0",
            sdpMLineIndex: 0,
        }));
        const iceAb = await qb.next();
        strict_1.default.equal(iceAb.type, "ICE_CANDIDATE");
        strict_1.default.equal(iceAb.fromPeerId, "A");
        strict_1.default.equal(iceAb.candidate, "ice-ab");
        passed += 1;
        a.send(JSON.stringify({ type: "OFFER", roomId: "demo", toPeerId: "C", sdp: "offer-ac" }));
        const offerAc = await qc.next();
        strict_1.default.equal(offerAc.type, "OFFER");
        strict_1.default.equal(offerAc.fromPeerId, "A");
        strict_1.default.equal(offerAc.sdp, "offer-ac");
        passed += 1;
        b.send(JSON.stringify({
            type: "ICE_CANDIDATE",
            roomId: "demo",
            toPeerId: "C",
            candidate: "ice-bc",
            sdpMid: "0",
            sdpMLineIndex: 0,
        }));
        const iceBc = await qc.next();
        strict_1.default.equal(iceBc.type, "ICE_CANDIDATE");
        strict_1.default.equal(iceBc.fromPeerId, "B");
        passed += 1;
        a.send(JSON.stringify({ type: "OFFER", roomId: "other", toPeerId: "X", sdp: "cross" }));
        const crossError = await qa.next();
        strict_1.default.equal(crossError.type, "ERROR");
        strict_1.default.equal(crossError.message, "roomId does not match current room");
        passed += 1;
        a.send(JSON.stringify({ type: "OFFER", roomId: "demo", toPeerId: "nobody", sdp: "missing" }));
        const missing = await qa.next();
        strict_1.default.equal(missing.type, "ERROR");
        strict_1.default.equal(missing.message, "Target peer not found");
        passed += 1;
        const stranger = await connect(url);
        const qs = new MessageQueue(stranger);
        stranger.send(JSON.stringify({ type: "OFFER", roomId: "demo", toPeerId: "A", sdp: "early" }));
        const notJoined = await qs.next();
        strict_1.default.equal(notJoined.type, "ERROR");
        strict_1.default.equal(notJoined.message, "Join a room before signaling");
        stranger.send(JSON.stringify({ type: "ANSWER", roomId: "demo", toPeerId: "A", sdp: "early" }));
        strict_1.default.equal((await qs.next()).message, "Join a room before signaling");
        stranger.send(JSON.stringify({
            type: "ICE_CANDIDATE",
            roomId: "demo",
            toPeerId: "A",
            candidate: "early",
            sdpMid: "0",
            sdpMLineIndex: 0,
        }));
        strict_1.default.equal((await qs.next()).message, "Join a room before signaling");
        stranger.close();
        passed += 1;
        a.send(JSON.stringify({
            type: "OFFER",
            roomId: "demo",
            fromPeerId: "spoof-as-C",
            toPeerId: "B",
            sdp: "spoofed-offer",
        }));
        const spoofed = await qb.next();
        strict_1.default.equal(spoofed.type, "OFFER");
        strict_1.default.equal(spoofed.fromPeerId, "A");
        strict_1.default.notEqual(spoofed.fromPeerId, "spoof-as-C");
        passed += 1;
        a.send("not-json{");
        const badJson = await qa.next();
        strict_1.default.equal(badJson.type, "ERROR");
        strict_1.default.equal(badJson.message, "Invalid JSON");
        passed += 1;
        a.send(JSON.stringify({ type: "HELLO_WORLD", roomId: "demo" }));
        const unknown = await qa.next();
        strict_1.default.equal(unknown.type, "ERROR");
        strict_1.default.equal(unknown.message, "Unknown message type");
        passed += 1;
        a.send(JSON.stringify({ type: "OFFER", roomId: "demo", toPeerId: "B" }));
        const missingSdp = await qa.next();
        strict_1.default.equal(missingSdp.type, "ERROR");
        strict_1.default.equal(missingSdp.message, "sdp is required");
        const bSawLeave = qb.next();
        const cSawLeave = qc.next();
        const dSawLeave = qd.next();
        a.close();
        strict_1.default.equal((await bSawLeave).type, "USER_LEFT");
        strict_1.default.equal((await cSawLeave).peerId, "A");
        strict_1.default.equal((await dSawLeave).peerId, "A");
        await wait(50);
        strict_1.default.equal(rooms.hasPeer("demo", "A"), false);
        passed += 1;
        b.close();
        c.close();
        d.close();
        outsider.close();
    });
    return passed;
}
async function main() {
    const passed = await runSignalingTests();
    console.log(`Signaling tests passed (${passed}/15 required scenarios).`);
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=signaling.test.js.map