import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { RoomManager } from "./room-manager.js";
import { attachSignaling } from "./signaling.js";

class MessageQueue {
  private readonly pending: Record<string, unknown>[] = [];
  private readonly waiters: Array<(value: Record<string, unknown>) => void> = [];

  constructor(socket: WebSocket) {
    socket.on("message", (raw) => {
      const value = JSON.parse(String(raw)) as Record<string, unknown>;
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(value);
      } else {
        this.pending.push(value);
      }
    });
  }

  next(timeoutMs = 3000): Promise<Record<string, unknown>> {
    if (this.pending.length > 0) {
      return Promise.resolve(this.pending.shift() as Record<string, unknown>);
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

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withServer(
  run: (url: string, rooms: RoomManager) => Promise<void>,
): Promise<void> {
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
  const sockets: WebSocket[] = [];
  try {
    await run(url, rooms);
  } finally {
    for (const socket of sockets) {
      socket.close();
    }
    wss.close();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function runSignalingTests(): Promise<number> {
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
    assert.equal(aJoined.type, "ROOM_JOINED");
    assert.equal(aJoined.peerId, "A");
    assert.deepEqual(aJoined.peers, []);
    passed += 1;

    b.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "demo", peerId: "B" }));
    const bJoined = await qb.next();
    const aSawB = await qa.next();
    assert.equal(bJoined.type, "ROOM_JOINED");
    assert.deepEqual(bJoined.peers, ["A"]);
    assert.equal(aSawB.type, "USER_JOINED");
    assert.equal(aSawB.peerId, "B");
    passed += 1;

    c.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "demo", peerId: "C" }));
    const cJoined = await qc.next();
    assert.equal(cJoined.type, "ROOM_JOINED");
    assert.deepEqual((cJoined.peers as string[]).sort(), ["A", "B"]);
    assert.equal((await qa.next()).peerId, "C");
    assert.equal((await qb.next()).peerId, "C");
    passed += 1;

    d.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "demo", peerId: "D" }));
    const dJoined = await qd.next();
    assert.equal(dJoined.type, "ROOM_JOINED");
    await qa.next();
    await qb.next();
    await qc.next();
    assert.ok((dJoined.peers as string[]).includes("A"));

    outsider.send(JSON.stringify({ type: "JOIN_ROOM", roomId: "other", peerId: "X" }));
    const xJoined = await qo.next();
    assert.equal(xJoined.type, "ROOM_JOINED");
    assert.deepEqual(xJoined.peers, []);

    a.send(JSON.stringify({ type: "OFFER", roomId: "demo", toPeerId: "B", sdp: "offer-ab" }));
    const offerAb = await qb.next();
    assert.equal(offerAb.type, "OFFER");
    assert.equal(offerAb.fromPeerId, "A");
    assert.equal(offerAb.toPeerId, "B");
    assert.equal(offerAb.sdp, "offer-ab");
    passed += 1;

    b.send(JSON.stringify({ type: "ANSWER", roomId: "demo", toPeerId: "A", sdp: "answer-ba" }));
    const answerBa = await qa.next();
    assert.equal(answerBa.type, "ANSWER");
    assert.equal(answerBa.fromPeerId, "B");
    assert.equal(answerBa.sdp, "answer-ba");
    passed += 1;

    a.send(
      JSON.stringify({
        type: "ICE_CANDIDATE",
        roomId: "demo",
        toPeerId: "B",
        candidate: "ice-ab",
        sdpMid: "0",
        sdpMLineIndex: 0,
      }),
    );
    const iceAb = await qb.next();
    assert.equal(iceAb.type, "ICE_CANDIDATE");
    assert.equal(iceAb.fromPeerId, "A");
    assert.equal(iceAb.candidate, "ice-ab");
    passed += 1;

    a.send(JSON.stringify({ type: "OFFER", roomId: "demo", toPeerId: "C", sdp: "offer-ac" }));
    const offerAc = await qc.next();
    assert.equal(offerAc.type, "OFFER");
    assert.equal(offerAc.fromPeerId, "A");
    assert.equal(offerAc.sdp, "offer-ac");
    passed += 1;

    b.send(
      JSON.stringify({
        type: "ICE_CANDIDATE",
        roomId: "demo",
        toPeerId: "C",
        candidate: "ice-bc",
        sdpMid: "0",
        sdpMLineIndex: 0,
      }),
    );
    const iceBc = await qc.next();
    assert.equal(iceBc.type, "ICE_CANDIDATE");
    assert.equal(iceBc.fromPeerId, "B");
    passed += 1;

    a.send(JSON.stringify({ type: "OFFER", roomId: "other", toPeerId: "X", sdp: "cross" }));
    const crossError = await qa.next();
    assert.equal(crossError.type, "ERROR");
    assert.equal(crossError.message, "roomId does not match current room");
    passed += 1;

    a.send(JSON.stringify({ type: "OFFER", roomId: "demo", toPeerId: "nobody", sdp: "missing" }));
    const missing = await qa.next();
    assert.equal(missing.type, "ERROR");
    assert.equal(missing.message, "Target peer not found");
    passed += 1;

    const stranger = await connect(url);
    const qs = new MessageQueue(stranger);
    stranger.send(JSON.stringify({ type: "OFFER", roomId: "demo", toPeerId: "A", sdp: "early" }));
    const notJoined = await qs.next();
    assert.equal(notJoined.type, "ERROR");
    assert.equal(notJoined.message, "Join a room before signaling");
    stranger.send(JSON.stringify({ type: "ANSWER", roomId: "demo", toPeerId: "A", sdp: "early" }));
    assert.equal((await qs.next()).message, "Join a room before signaling");
    stranger.send(
      JSON.stringify({
        type: "ICE_CANDIDATE",
        roomId: "demo",
        toPeerId: "A",
        candidate: "early",
        sdpMid: "0",
        sdpMLineIndex: 0,
      }),
    );
    assert.equal((await qs.next()).message, "Join a room before signaling");
    stranger.close();
    passed += 1;

    a.send(
      JSON.stringify({
        type: "OFFER",
        roomId: "demo",
        fromPeerId: "spoof-as-C",
        toPeerId: "B",
        sdp: "spoofed-offer",
      }),
    );
    const spoofed = await qb.next();
    assert.equal(spoofed.type, "OFFER");
    assert.equal(spoofed.fromPeerId, "A");
    assert.notEqual(spoofed.fromPeerId, "spoof-as-C");
    passed += 1;

    a.send("not-json{");
    const badJson = await qa.next();
    assert.equal(badJson.type, "ERROR");
    assert.equal(badJson.message, "Invalid JSON");
    passed += 1;

    a.send(JSON.stringify({ type: "HELLO_WORLD", roomId: "demo" }));
    const unknown = await qa.next();
    assert.equal(unknown.type, "ERROR");
    assert.equal(unknown.message, "Unknown message type");
    passed += 1;

    a.send(JSON.stringify({ type: "OFFER", roomId: "demo", toPeerId: "B" }));
    const missingSdp = await qa.next();
    assert.equal(missingSdp.type, "ERROR");
    assert.equal(missingSdp.message, "sdp is required");

    const bSawLeave = qb.next();
    const cSawLeave = qc.next();
    const dSawLeave = qd.next();
    a.close();
    assert.equal((await bSawLeave).type, "USER_LEFT");
    assert.equal((await cSawLeave).peerId, "A");
    assert.equal((await dSawLeave).peerId, "A");
    await wait(50);
    assert.equal(rooms.hasPeer("demo", "A"), false);
    passed += 1;

    b.close();
    c.close();
    d.close();
    outsider.close();
  });

  return passed;
}

async function main(): Promise<void> {
  const passed = await runSignalingTests();
  console.log(`Signaling tests passed (${passed}/15 required scenarios).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
