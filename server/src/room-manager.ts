import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type { Peer } from "./types.js";

export type JoinSuccess = {
  ok: true;
  peer: Peer;
  /** Peer vừa rời room cũ (cùng socket join room khác). */
  previous?: Peer;
  /** peerId đã có trong room trước khi peer mới vào. */
  existingPeerIds: string[];
};

export type JoinFailure = {
  ok: false;
  message: string;
};

export type JoinResult = JoinSuccess | JoinFailure;

export type RelaySuccess = {
  ok: true;
  sender: Peer;
  target: Peer;
};

export type RelayFailure = {
  ok: false;
  message: string;
};

export type RelayResult = RelaySuccess | RelayFailure;

/**
 * Quản lý nhiều room trong RAM.
 * Mỗi room là Map peerId -> Peer { peerId, roomId, socket }.
 * Server không lưu media; chỉ biết ai đang ở room nào để signaling.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Map<string, Peer>>();
  private readonly socketToPeer = new Map<WebSocket, Peer>();

  createRoom(roomId: string = randomUUID()): string {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Map());
    }
    return roomId;
  }

  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  hasPeer(roomId: string, peerId: string): boolean {
    return this.rooms.get(roomId)?.has(peerId) ?? false;
  }

  /**
   * Join room: tạo room nếu chưa có.
   * Một socket chỉ thuộc một room tại một thời điểm.
   * peerId không được trùng trong cùng room (socket khác).
   */
  joinRoom(roomId: string, socket: WebSocket, peerId?: string): JoinResult {
    const normalizedRoomId = typeof roomId === "string" ? roomId.trim() : "";
    if (!normalizedRoomId) {
      return { ok: false, message: "roomId is required" };
    }

    const requestedId = peerId?.trim();
    const nextPeerId = requestedId || randomUUID();

    const alreadyHere = this.socketToPeer.get(socket);
    if (
      alreadyHere &&
      alreadyHere.roomId === normalizedRoomId &&
      alreadyHere.peerId === nextPeerId
    ) {
      return {
        ok: true,
        peer: alreadyHere,
        existingPeerIds: this.getPeerIds(normalizedRoomId, alreadyHere.peerId),
      };
    }

    const roomPeers = this.rooms.get(normalizedRoomId);
    const occupant = roomPeers?.get(nextPeerId);
    if (occupant && occupant.socket !== socket) {
      return {
        ok: false,
        message: `peerId ${nextPeerId} is already in room ${normalizedRoomId}`,
      };
    }

    let previous: Peer | undefined;
    if (alreadyHere) {
      previous = this.leaveRoom(socket);
    }

    this.createRoom(normalizedRoomId);
    const room = this.rooms.get(normalizedRoomId);
    if (!room) {
      return { ok: false, message: `Room ${normalizedRoomId} was not created` };
    }

    const existingPeerIds = [...room.keys()];
    const peer: Peer = {
      peerId: nextPeerId,
      roomId: normalizedRoomId,
      socket,
    };
    room.set(peer.peerId, peer);
    this.socketToPeer.set(socket, peer);

    return { ok: true, peer, previous, existingPeerIds };
  }

  leaveRoom(socket: WebSocket): Peer | undefined {
    const peer = this.socketToPeer.get(socket);
    if (!peer) {
      return undefined;
    }

    const room = this.rooms.get(peer.roomId);
    const stored = room?.get(peer.peerId);
    if (stored && stored.socket === socket) {
      room?.delete(peer.peerId);
    }

    this.socketToPeer.delete(socket);

    if (room && room.size === 0) {
      this.rooms.delete(peer.roomId);
    }

    return peer;
  }

  getPeer(socket: WebSocket): Peer | undefined {
    return this.socketToPeer.get(socket);
  }

  getPeerById(roomId: string, peerId: string): Peer | undefined {
    return this.rooms.get(roomId)?.get(peerId);
  }

  getPeers(roomId: string): Peer[] {
    const room = this.rooms.get(roomId);
    return room ? [...room.values()] : [];
  }

  getPeerIds(roomId: string, exceptPeerId?: string): string[] {
    return this.getPeers(roomId)
      .map((peer) => peer.peerId)
      .filter((id) => id !== exceptPeerId);
  }

  /**
   * Relay chỉ khi:
   * - sender đang trong room (theo socket, không tin client)
   * - roomId client gửi khớp room hiện tại
   * - target cùng room, còn tồn tại, WebSocket OPEN
   */
  resolveRelayTarget(
    socket: WebSocket,
    claimedRoomId: string,
    toPeerId: string,
  ): RelayResult {
    const sender = this.socketToPeer.get(socket);
    if (!sender) {
      return { ok: false, message: "Join a room before signaling" };
    }

    if (claimedRoomId !== sender.roomId) {
      return { ok: false, message: "roomId does not match current room" };
    }

    if (!toPeerId || toPeerId === sender.peerId) {
      return { ok: false, message: "Invalid toPeerId" };
    }

    const target = this.rooms.get(sender.roomId)?.get(toPeerId);
    if (!target) {
      return { ok: false, message: "Target peer not found" };
    }

    if (target.roomId !== sender.roomId) {
      return { ok: false, message: "Target peer is not in the same room" };
    }

    if (target.socket.readyState !== WebSocket.OPEN) {
      return { ok: false, message: "Target peer is not connected" };
    }

    return { ok: true, sender, target };
  }
}
