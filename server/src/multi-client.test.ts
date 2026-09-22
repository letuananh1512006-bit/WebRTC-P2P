import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { RoomManager } from "./room-manager.js";
import { attachSignaling } from "./signaling.js";

const PORT = 3000;
const URL = `ws://localhost:${PORT}`;

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

  next(timeoutMs = 4000): Promise<Record<string, unknown>> {
    if (this.pending.length > 0) {
      return Promise.resolve(this.pending.shift() as Record<string, unknown>);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for message")),
        timeoutMs,
      );
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

function join(socket: WebSocket, roomId: string, peerId: string): void {
  socket.send(JSON.stringify({ type: "JOIN_ROOM", roomId, peerId }));
}

function offer(socket: WebSocket, toPeerId: string, sdp: string, extra: Record<string, unknown> = {}): void {
  socket.send(
    JSON.stringify({
      type: "OFFER",
      roomId: "demo",
      toPeerId,
      sdp,
      ...extra,
    }),
  );
}

function answer(socket: WebSocket, toPeerId: string, sdp: string): void {
  socket.send(JSON.stringify({ type: "ANSWER", roomId: "demo", toPeerId, sdp }));
}

function ice(socket: WebSocket, toPeerId: string, candidate: string): void {
  socket.send(
    JSON.stringify({
      type: "ICE_CANDIDATE",
      roomId: "demo",
      toPeerId,
      candidate,
      sdpMid: "0",
      sdpMLineIndex: 0,
    }),
  );
}

function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    socket.once("close", () => resolve());
    socket.close();
    setTimeout(resolve, 1000);
  });
}

async function startServer(): Promise<{
  close: () => Promise<void>;
}> {
  const rooms = new RoomManager();
  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "webrtc-signaling" }));
  });
  const wss = new WebSocketServer({ server: httpServer });
  attachSignaling(wss, rooms);

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(PORT, () => resolve());
  });

  return {
    close: async () => {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function run(): Promise<void> {
  const server = await startServer();
  const clients: WebSocket[] = [];

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
    assert.equal(aJoined.type, "ROOM_JOINED");
    assert.equal(aJoined.roomId, "demo");
    assert.equal(aJoined.peerId, "A");
    assert.deepEqual(aJoined.peers, []);

    join(b, "demo", "B");
    const bJoined = await qb.next();
    const aSawB = await qa.next();
    assert.equal(bJoined.type, "ROOM_JOINED");
    assert.equal(bJoined.peerId, "B");
    assert.ok((bJoined.peers as string[]).includes("A"));
    assert.equal(aSawB.type, "USER_JOINED");
    assert.equal(aSawB.peerId, "B");

    join(c, "demo", "C");
    const cJoined = await qc.next();
    const aSawC = await qa.next();
    const bSawC = await qb.next();
    assert.equal(cJoined.type, "ROOM_JOINED");
    assert.deepEqual((cJoined.peers as string[]).sort(), ["A", "B"]);
    assert.equal(aSawC.type, "USER_JOINED");
    assert.equal(aSawC.peerId, "C");
    assert.equal(bSawC.type, "USER_JOINED");
    assert.equal(bSawC.peerId, "C");

    join(d, "demo", "D");
    const dJoined = await qd.next();
    const aSawD = await qa.next();
    const bSawD = await qb.next();
    const cSawD = await qc.next();
    assert.equal(dJoined.type, "ROOM_JOINED");
    assert.deepEqual((dJoined.peers as string[]).sort(), ["A", "B", "C"]);
    assert.equal(aSawD.peerId, "D");
    assert.equal(bSawD.peerId, "D");
    assert.equal(cSawD.peerId, "D");

    offer(a, "B", "offer-ab");
    const offerAb = await qb.next();
    assert.equal(offerAb.type, "OFFER");
    assert.equal(offerAb.fromPeerId, "A");
    assert.equal(offerAb.toPeerId, "B");
    assert.equal(offerAb.sdp, "offer-ab");

    offer(a, "C", "offer-ac");
    const offerAc = await qc.next();
    assert.equal(offerAc.type, "OFFER");
    assert.equal(offerAc.fromPeerId, "A");
    assert.equal(offerAc.toPeerId, "C");

    offer(a, "D", "offer-ad");
    const offerAd = await qd.next();
    assert.equal(offerAd.type, "OFFER");
    assert.equal(offerAd.fromPeerId, "A");
    assert.equal(offerAd.toPeerId, "D");

    answer(b, "A", "answer-ba");
    answer(c, "A", "answer-ca");
    answer(d, "A", "answer-da");
    const answers = [await qa.next(), await qa.next(), await qa.next()];
    assert.equal(answers.length, 3);
    assert.ok(answers.every((msg) => msg.type === "ANSWER" && msg.toPeerId === "A"));
    assert.deepEqual(
      answers.map((msg) => msg.fromPeerId).sort(),
      ["B", "C", "D"],
    );
    assert.deepEqual(
      answers.map((msg) => msg.sdp).sort(),
      ["answer-ba", "answer-ca", "answer-da"],
    );

    ice(a, "B", "ice-ab");
    const iceAb = await qb.next();
    assert.equal(iceAb.type, "ICE_CANDIDATE");
    assert.equal(iceAb.fromPeerId, "A");
    assert.equal(iceAb.candidate, "ice-ab");

    ice(b, "C", "ice-bc");
    const iceBc = await qc.next();
    assert.equal(iceBc.type, "ICE_CANDIDATE");
    assert.equal(iceBc.fromPeerId, "B");
    assert.equal(iceBc.candidate, "ice-bc");

    ice(c, "D", "ice-cd");
    const iceCd = await qd.next();
    assert.equal(iceCd.type, "ICE_CANDIDATE");
    assert.equal(iceCd.fromPeerId, "C");
    assert.equal(iceCd.candidate, "ice-cd");

    ice(d, "A", "ice-da");
    const iceDa = await qa.next();
    assert.equal(iceDa.type, "ICE_CANDIDATE");
    assert.equal(iceDa.fromPeerId, "D");
    assert.equal(iceDa.candidate, "ice-da");

    a.send(
      JSON.stringify({
        type: "OFFER",
        roomId: "demo",
        fromPeerId: "FAKE",
        toPeerId: "B",
        sdp: "test-sdp",
      }),
    );
    const spoofed = await qb.next();
    assert.equal(spoofed.type, "OFFER");
    assert.equal(spoofed.fromPeerId, "A");
    assert.notEqual(spoofed.fromPeerId, "FAKE");
    assert.equal(spoofed.sdp, "test-sdp");

    join(e, "other", "E");
    const eJoined = await qe.next();
    assert.equal(eJoined.type, "ROOM_JOINED");
    assert.equal(eJoined.roomId, "other");
    assert.deepEqual(eJoined.peers, []);

    a.send(
      JSON.stringify({
        type: "OFFER",
        roomId: "other",
        toPeerId: "E",
        sdp: "cross-room",
      }),
    );
    const crossRoom = await qa.next();
    assert.equal(crossRoom.type, "ERROR");
    assert.equal(crossRoom.message, "roomId does not match current room");

    const aLeft = qa.next();
    const bLeft = qb.next();
    const cLeft = qc.next();
    d.close();
    const leftA = await aLeft;
    const leftB = await bLeft;
    const leftC = await cLeft;
    assert.ok(
      [leftA, leftB, leftC].every(
        (msg) => msg.type === "USER_LEFT" && msg.peerId === "D" && msg.roomId === "demo",
      ),
    );
  } finally {
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
