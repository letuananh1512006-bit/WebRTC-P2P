"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomManager = void 0;
const node_crypto_1 = require("node:crypto");
const ws_1 = require("ws");
/**
 * Quản lý nhiều room trong RAM.
 * Mỗi room là Map peerId -> Peer { peerId, roomId, socket }.
 * Server không lưu media; chỉ biết ai đang ở room nào để signaling.
 */
class RoomManager {
    rooms = new Map();
    socketToPeer = new Map();
    createRoom(roomId = (0, node_crypto_1.randomUUID)()) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Map());
        }
        return roomId;
    }
    hasRoom(roomId) {
        return this.rooms.has(roomId);
    }
    hasPeer(roomId, peerId) {
        return this.rooms.get(roomId)?.has(peerId) ?? false;
    }
    /**
     * Join room: tạo room nếu chưa có.
     * Một socket chỉ thuộc một room tại một thời điểm.
     * peerId không được trùng trong cùng room (socket khác).
     */
    joinRoom(roomId, socket, peerId) {
        const normalizedRoomId = typeof roomId === "string" ? roomId.trim() : "";
        if (!normalizedRoomId) {
            return { ok: false, message: "roomId is required" };
        }
        const requestedId = peerId?.trim();
        const nextPeerId = requestedId || (0, node_crypto_1.randomUUID)();
        const alreadyHere = this.socketToPeer.get(socket);
        if (alreadyHere &&
            alreadyHere.roomId === normalizedRoomId &&
            alreadyHere.peerId === nextPeerId) {
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
        let previous;
        if (alreadyHere) {
            previous = this.leaveRoom(socket);
        }
        this.createRoom(normalizedRoomId);
        const room = this.rooms.get(normalizedRoomId);
        if (!room) {
            return { ok: false, message: `Room ${normalizedRoomId} was not created` };
        }
        const existingPeerIds = [...room.keys()];
        const peer = {
            peerId: nextPeerId,
            roomId: normalizedRoomId,
            socket,
        };
        room.set(peer.peerId, peer);
        this.socketToPeer.set(socket, peer);
        return { ok: true, peer, previous, existingPeerIds };
    }
    leaveRoom(socket) {
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
    getPeer(socket) {
        return this.socketToPeer.get(socket);
    }
    getPeerById(roomId, peerId) {
        return this.rooms.get(roomId)?.get(peerId);
    }
    getPeers(roomId) {
        const room = this.rooms.get(roomId);
        return room ? [...room.values()] : [];
    }
    getPeerIds(roomId, exceptPeerId) {
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
    resolveRelayTarget(socket, claimedRoomId, toPeerId) {
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
        if (target.socket.readyState !== ws_1.WebSocket.OPEN) {
            return { ok: false, message: "Target peer is not connected" };
        }
        return { ok: true, sender, target };
    }
}
exports.RoomManager = RoomManager;
//# sourceMappingURL=room-manager.js.map