import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { RoomManager } from "./room-manager.js";
import { attachSignaling } from "./signaling.js";

class FakeSocket {
  readyState = WebSocket.OPEN;
  send(_data: string): void {}
}

function fakeSocket(): WebSocket {
  return new FakeSocket() as unknown as WebSocket;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function onceMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for message")), 3000);
    socket.once("message", (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(raw)) as Record<string, unknown>);
    });
  });
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

async function runUnitCases(): Promise<void> {
  const rooms = new RoomManager();
  const a = fakeSocket();
  const b = fakeSocket();
  const c = fakeSocket();
  const otherRoom = fakeSocket();

  const joinA = rooms.joinRoom("demo", a, "A");
  assert.equal(joinA.ok, true);
  if (!joinA.ok) return;
  assert.deepEqual(joinA.existingPeerIds, []);
  assert.equal(rooms.hasRoom("demo"), true);
  assert.equal(rooms.hasPeer("demo", "A"), true);

  const joinB = rooms.joinRoom("demo", b, "B");
  assert.equal(joinB.ok, true);
  if (!joinB.ok) return;
  assert.deepEqual(joinB.existingPeerIds, ["A"]);

  const joinC = rooms.joinRoom("demo", c, "C");
  assert.equal(joinC.ok, true);
  if (!joinC.ok) return;
  assert.deepEqual(joinC.existingPeerIds.sort(), ["A", "B"]);
  assert.deepEqual(rooms.getPeerIds("demo").sort(), ["A", "B", "C"]);

  const leftA = rooms.leaveRoom(a);
  assert.equal(leftA?.peerId, "A");
  assert.equal(rooms.hasPeer("demo", "A"), false);
  assert.deepEqual(rooms.getPeerIds("demo").sort(), ["B", "C"]);

  rooms.leaveRoom(b);
  assert.deepEqual(rooms.getPeerIds("demo"), ["C"]);
  assert.equal(rooms.hasRoom("demo"), true);

  rooms.leaveRoom(c);
  assert.equal(rooms.hasRoom("demo"), false);
  assert.deepEqual(rooms.getPeerIds("demo"), []);

  const joinOther = rooms.joinRoom("other", otherRoom, "X");
  assert.equal(joinOther.ok, true);
  assert.equal(rooms.hasRoom("other"), true);
  assert.equal(rooms.hasRoom("demo"), false);

  assert.equal(rooms.hasPeer("demo", "missing"), false);
  assert.equal(rooms.getPeerById("other", "nobody"), undefined);

  const dup = rooms.joinRoom("other", fakeSocket(), "X");
  assert.equal(dup.ok, false);
  if (!dup.ok) {
    assert.match(dup.message, /already in room/);
  }

  const y = fakeSocket();
  const joinY = rooms.joinRoom("other", y, "Y");
  assert.equal(joinY.ok, true);

  const crossRoom = rooms.resolveRelayTarget(y, "demo", "X");
  assert.equal(crossRoom.ok, false);
  if (!crossRoom.ok) {
    assert.equal(crossRoom.message, "roomId does not match current room");
  }

  const missingTarget = rooms.resolveRelayTarget(y, "other", "Z");
  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) {
    assert.equal(missingTarget.message, "Target peer not found");
  }

  const sameRoom = rooms.resolveRelayTarget(y, "other", "X");
  assert.equal(sameRoom.ok, true);

  const closed = {
    readyState: WebSocket.CLOSED,
    send(): void {},
  } as unknown as WebSocket;
  rooms.joinRoom("other", closed, "Z");
  const closedTarget = rooms.resolveRelayTarget(y, "other", "Z");
  assert.equal(closedTarget.ok, false);
  if (!closedTarget.ok) {
    assert.equal(closedTarget.message, "Target peer is not connected");
  }
}

async function runSignalingCases(): Promise<void> {
  const rooms = new RoomManager();
  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });
  attachSignaling(wss, rooms);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
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
    assert.equal(aJoined.type, "ROOM_JOINED");
    assert.deepEqual(aJoined.peers, []);

    const bUserJoined = onceMessage(a);
    b.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "demo", peerId: "B" }));
    const bJoined = await onceMessage(b);
    assert.equal(bJoined.type, "ROOM_JOINED");
    assert.deepEqual(bJoined.peers, ["A"]);
    assert.equal((await bUserJoined).type, "USER_JOINED");

    const aSawC = onceMessage(a);
    const bSawC = onceMessage(b);
    c.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "demo", peerId: "C" }));
    const cJoined = await onceMessage(c);
    assert.equal(cJoined.type, "ROOM_JOINED");
    assert.deepEqual((cJoined.peers as string[]).sort(), ["A", "B"]);
    assert.equal((await aSawC).peerId, "C");
    assert.equal((await bSawC).peerId, "C");

    other.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "other", peerId: "X" }));
    const otherJoined = await onceMessage(other);
    assert.equal(otherJoined.type, "ROOM_JOINED");
    assert.deepEqual(otherJoined.peers, []);

    a.send(
      JSON.stringify({
        type: "OFFER",
        roomId: "other",
        fromPeerId: "spoof",
        toPeerId: "X",
        sdp: "fake-sdp",
      }),
    );
    const crossError = await onceMessage(a);
    assert.equal(crossError.type, "ERROR");
    assert.equal(crossError.message, "roomId does not match current room");

    a.send(
      JSON.stringify({
        type: "OFFER",
        roomId: "demo",
        fromPeerId: "A",
        toPeerId: "nobody",
        sdp: "fake-sdp",
      }),
    );
    const missingError = await onceMessage(a);
    assert.equal(missingError.type, "ERROR");
    assert.equal(missingError.message, "Target peer not found");

    const bOffer = onceMessage(b);
    a.send(
      JSON.stringify({
        type: "OFFER",
        roomId: "demo",
        fromPeerId: "spoof-id",
        toPeerId: "B",
        sdp: "real-sdp",
      }),
    );
    const offer = await bOffer;
    assert.equal(offer.type, "OFFER");
    assert.equal(offer.fromPeerId, "A");
    assert.equal(offer.sdp, "real-sdp");

    const dup = await connect(url);
    dup.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "demo", peerId: "A" }));
    const dupError = await onceMessage(dup);
    assert.equal(dupError.type, "ERROR");
    assert.match(String(dupError.message), /already in room/);
    dup.close();

    const bSawLeave = onceMessage(b);
    const cSawLeave = onceMessage(c);
    a.close();
    assert.equal((await bSawLeave).type, "USER_LEFT");
    assert.equal((await cSawLeave).peerId, "A");
    await wait(50);
    assert.equal(rooms.hasPeer("demo", "A"), false);

    const cSawBLeave = onceMessage(c);
    b.close();
    assert.equal((await cSawBLeave).type, "USER_LEFT");

    c.close();
    await wait(50);
    assert.equal(rooms.hasRoom("demo"), false);
    assert.equal(rooms.hasRoom("other"), true);

    other.close();
    await wait(50);
    assert.equal(rooms.hasRoom("other"), false);
  } finally {
    wss.close();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function main(): Promise<void> {
  await runUnitCases();
  await runSignalingCases();
  console.log("Room Manager tests passed (10 scenarios).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
