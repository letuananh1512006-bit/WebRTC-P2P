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
class FakeSocket {
    readyState = ws_1.WebSocket.OPEN;
    send(_data) { }
}
function fakeSocket() {
    return new FakeSocket();
}
async function wait(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
function onceMessage(socket) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out waiting for message")), 3000);
        socket.once("message", (raw) => {
            clearTimeout(timer);
            resolve(JSON.parse(String(raw)));
        });
    });
}
function connect(url) {
    return new Promise((resolve, reject) => {
        const socket = new ws_1.WebSocket(url);
        socket.once("open", () => resolve(socket));
        socket.once("error", reject);
    });
}
async function runUnitCases() {
    const rooms = new room_manager_js_1.RoomManager();
    const a = fakeSocket();
    const b = fakeSocket();
    const c = fakeSocket();
    const otherRoom = fakeSocket();
    const joinA = rooms.joinRoom("demo", a, "A");
    strict_1.default.equal(joinA.ok, true);
    if (!joinA.ok)
        return;
    strict_1.default.deepEqual(joinA.existingPeerIds, []);
    strict_1.default.equal(rooms.hasRoom("demo"), true);
    strict_1.default.equal(rooms.hasPeer("demo", "A"), true);
    const joinB = rooms.joinRoom("demo", b, "B");
    strict_1.default.equal(joinB.ok, true);
    if (!joinB.ok)
        return;
    strict_1.default.deepEqual(joinB.existingPeerIds, ["A"]);
    const joinC = rooms.joinRoom("demo", c, "C");
    strict_1.default.equal(joinC.ok, true);
    if (!joinC.ok)
        return;
    strict_1.default.deepEqual(joinC.existingPeerIds.sort(), ["A", "B"]);
    strict_1.default.deepEqual(rooms.getPeerIds("demo").sort(), ["A", "B", "C"]);
    const leftA = rooms.leaveRoom(a);
    strict_1.default.equal(leftA?.peerId, "A");
    strict_1.default.equal(rooms.hasPeer("demo", "A"), false);
    strict_1.default.deepEqual(rooms.getPeerIds("demo").sort(), ["B", "C"]);
    rooms.leaveRoom(b);
    strict_1.default.deepEqual(rooms.getPeerIds("demo"), ["C"]);
    strict_1.default.equal(rooms.hasRoom("demo"), true);
    rooms.leaveRoom(c);
    strict_1.default.equal(rooms.hasRoom("demo"), false);
    strict_1.default.deepEqual(rooms.getPeerIds("demo"), []);
    const joinOther = rooms.joinRoom("other", otherRoom, "X");
    strict_1.default.equal(joinOther.ok, true);
    strict_1.default.equal(rooms.hasRoom("other"), true);
    strict_1.default.equal(rooms.hasRoom("demo"), false);
    strict_1.default.equal(rooms.hasPeer("demo", "missing"), false);
    strict_1.default.equal(rooms.getPeerById("other", "nobody"), undefined);
    const dup = rooms.joinRoom("other", fakeSocket(), "X");
    strict_1.default.equal(dup.ok, false);
    if (!dup.ok) {
        strict_1.default.match(dup.message, /already in room/);
    }
    const y = fakeSocket();
    const joinY = rooms.joinRoom("other", y, "Y");
    strict_1.default.equal(joinY.ok, true);
    const crossRoom = rooms.resolveRelayTarget(y, "demo", "X");
    strict_1.default.equal(crossRoom.ok, false);
    if (!crossRoom.ok) {
        strict_1.default.equal(crossRoom.message, "roomId does not match current room");
    }
    const missingTarget = rooms.resolveRelayTarget(y, "other", "Z");
    strict_1.default.equal(missingTarget.ok, false);
    if (!missingTarget.ok) {
        strict_1.default.equal(missingTarget.message, "Target peer not found");
    }
    const sameRoom = rooms.resolveRelayTarget(y, "other", "X");
    strict_1.default.equal(sameRoom.ok, true);
    const closed = {
        readyState: ws_1.WebSocket.CLOSED,
        send() { },
    };
    rooms.joinRoom("other", closed, "Z");
    const closedTarget = rooms.resolveRelayTarget(y, "other", "Z");
    strict_1.default.equal(closedTarget.ok, false);
    if (!closedTarget.ok) {
        strict_1.default.equal(closedTarget.message, "Target peer is not connected");
    }
}
async function runSignalingCases() {
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
    try {
        const a = await connect(url);
        const b = await connect(url);
        const c = await connect(url);
        const other = await connect(url);
        a.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "demo", peerId: "A" }));
        const aJoined = await onceMessage(a);
        strict_1.default.equal(aJoined.type, "ROOM_JOINED");
        strict_1.default.deepEqual(aJoined.peers, []);
        const bUserJoined = onceMessage(a);
        b.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "demo", peerId: "B" }));
        const bJoined = await onceMessage(b);
        strict_1.default.equal(bJoined.type, "ROOM_JOINED");
        strict_1.default.deepEqual(bJoined.peers, ["A"]);
        strict_1.default.equal((await bUserJoined).type, "USER_JOINED");
        const aSawC = onceMessage(a);
        const bSawC = onceMessage(b);
        c.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "demo", peerId: "C" }));
        const cJoined = await onceMessage(c);
        strict_1.default.equal(cJoined.type, "ROOM_JOINED");
        strict_1.default.deepEqual(cJoined.peers.sort(), ["A", "B"]);
        strict_1.default.equal((await aSawC).peerId, "C");
        strict_1.default.equal((await bSawC).peerId, "C");
        other.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "other", peerId: "X" }));
        const otherJoined = await onceMessage(other);
        strict_1.default.equal(otherJoined.type, "ROOM_JOINED");
        strict_1.default.deepEqual(otherJoined.peers, []);
        a.send(JSON.stringify({
            type: "OFFER",
            roomId: "other",
            fromPeerId: "spoof",
            toPeerId: "X",
            sdp: "fake-sdp",
        }));
        const crossError = await onceMessage(a);
        strict_1.default.equal(crossError.type, "ERROR");
        strict_1.default.equal(crossError.message, "roomId does not match current room");
        a.send(JSON.stringify({
            type: "OFFER",
            roomId: "demo",
            fromPeerId: "A",
            toPeerId: "nobody",
            sdp: "fake-sdp",
        }));
        const missingError = await onceMessage(a);
        strict_1.default.equal(missingError.type, "ERROR");
        strict_1.default.equal(missingError.message, "Target peer not found");
        const bOffer = onceMessage(b);
        a.send(JSON.stringify({
            type: "OFFER",
            roomId: "demo",
            fromPeerId: "spoof-id",
            toPeerId: "B",
            sdp: "real-sdp",
        }));
        const offer = await bOffer;
        strict_1.default.equal(offer.type, "OFFER");
        strict_1.default.equal(offer.fromPeerId, "A");
        strict_1.default.equal(offer.sdp, "real-sdp");
        const dup = await connect(url);
        dup.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "demo", peerId: "A" }));
        const dupError = await onceMessage(dup);
        strict_1.default.equal(dupError.type, "ERROR");
        strict_1.default.match(String(dupError.message), /already in room/);
        dup.close();
        const bSawLeave = onceMessage(b);
        const cSawLeave = onceMessage(c);
        a.close();
        strict_1.default.equal((await bSawLeave).type, "USER_LEFT");
        strict_1.default.equal((await cSawLeave).peerId, "A");
        await wait(50);
        strict_1.default.equal(rooms.hasPeer("demo", "A"), false);
        const cSawBLeave = onceMessage(c);
        b.close();
        strict_1.default.equal((await cSawBLeave).type, "USER_LEFT");
        c.close();
        await wait(50);
        strict_1.default.equal(rooms.hasRoom("demo"), false);
        strict_1.default.equal(rooms.hasRoom("other"), true);
        other.close();
        await wait(50);
        strict_1.default.equal(rooms.hasRoom("other"), false);
    }
    finally {
        wss.close();
        await new Promise((resolve, reject) => {
            httpServer.close((err) => (err ? reject(err) : resolve()));
        });
    }
}
async function main() {
    await runUnitCases();
    await runSignalingCases();
    console.log("Room Manager tests passed (10 scenarios).");
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=room-manager.test.js.map