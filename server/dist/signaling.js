"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachSignaling = attachSignaling;
const ws_1 = require("ws");
const RELAY_TYPES = new Set(["OFFER", "ANSWER", "ICE_CANDIDATE"]);
function attachSignaling(wss, rooms) {
    wss.on("connection", (socket, _request) => {
        socket.on("message", (raw) => {
            try {
                const text = typeof raw === "string" ? raw : raw.toString();
                let parsed;
                try {
                    parsed = JSON.parse(text);
                }
                catch {
                    send(socket, { type: "ERROR", message: "Invalid JSON" });
                    return;
                }
                handleMessage(rooms, socket, parsed);
            }
            catch {
                send(socket, { type: "ERROR", message: "Failed to process message" });
            }
        });
        socket.on("close", () => {
            handleLeave(rooms, socket);
        });
        socket.on("error", () => {
            handleLeave(rooms, socket);
        });
    });
}
function handleMessage(rooms, socket, parsed) {
    if (!isRecord(parsed)) {
        send(socket, { type: "ERROR", message: "Invalid message" });
        return;
    }
    const type = parsed.type;
    if (typeof type !== "string" || type.length === 0) {
        send(socket, { type: "ERROR", message: "Missing message type" });
        return;
    }
    switch (type) {
        case "JOIN_ROOM": {
            const join = parseJoin(parsed);
            if (!join.ok) {
                send(socket, { type: "ERROR", message: join.message });
                return;
            }
            handleJoin(rooms, socket, join.value.roomId, join.value.peerId);
            break;
        }
        case "OFFER":
        case "ANSWER":
        case "ICE_CANDIDATE": {
            const relay = parseRelay(type, parsed);
            if (!relay.ok) {
                send(socket, { type: "ERROR", message: relay.message });
                return;
            }
            handleRelay(rooms, socket, relay.value);
            break;
        }
        default:
            send(socket, { type: "ERROR", message: "Unknown message type" });
    }
}
function handleJoin(rooms, socket, roomId, requestedPeerId) {
    const result = rooms.joinRoom(roomId, socket, requestedPeerId);
    if (!result.ok) {
        send(socket, { type: "ERROR", message: result.message });
        return;
    }
    if (result.previous) {
        broadcastUserLeft(rooms, result.previous);
    }
    send(socket, {
        type: "ROOM_JOINED",
        roomId: result.peer.roomId,
        peerId: result.peer.peerId,
        peers: result.existingPeerIds,
    });
    for (const other of rooms.getPeers(result.peer.roomId)) {
        if (other.peerId === result.peer.peerId) {
            continue;
        }
        send(other.socket, {
            type: "USER_JOINED",
            roomId: result.peer.roomId,
            peerId: result.peer.peerId,
        });
    }
}
function handleRelay(rooms, socket, message) {
    if (!RELAY_TYPES.has(message.type)) {
        return;
    }
    const relay = rooms.resolveRelayTarget(socket, message.roomId, message.toPeerId);
    if (!relay.ok) {
        send(socket, { type: "ERROR", message: relay.message });
        return;
    }
    const payload = buildRelayPayload(message, relay.sender.peerId, relay.sender.roomId);
    send(relay.target.socket, payload);
}
function buildRelayPayload(message, fromPeerId, roomId) {
    if (message.type === "ICE_CANDIDATE") {
        return {
            type: "ICE_CANDIDATE",
            roomId,
            fromPeerId,
            toPeerId: message.toPeerId,
            candidate: message.candidate,
            sdpMid: message.sdpMid,
            sdpMLineIndex: message.sdpMLineIndex,
        };
    }
    return {
        type: message.type,
        roomId,
        fromPeerId,
        toPeerId: message.toPeerId,
        sdp: message.sdp,
    };
}
function handleLeave(rooms, socket) {
    const peer = rooms.leaveRoom(socket);
    if (!peer) {
        return;
    }
    broadcastUserLeft(rooms, peer);
}
function broadcastUserLeft(rooms, peer) {
    for (const remaining of rooms.getPeers(peer.roomId)) {
        send(remaining.socket, {
            type: "USER_LEFT",
            roomId: peer.roomId,
            peerId: peer.peerId,
        });
    }
}
function parseJoin(raw) {
    const roomId = requiredString(raw.roomId, "roomId");
    if (!roomId.ok) {
        return roomId;
    }
    if (raw.peerId !== undefined) {
        const peerId = requiredString(raw.peerId, "peerId");
        if (!peerId.ok) {
            return peerId;
        }
        return { ok: true, value: { type: "JOIN_ROOM", roomId: roomId.value, peerId: peerId.value } };
    }
    return { ok: true, value: { type: "JOIN_ROOM", roomId: roomId.value } };
}
function parseRelay(type, raw) {
    const roomId = requiredString(raw.roomId, "roomId");
    if (!roomId.ok) {
        return roomId;
    }
    const toPeerId = requiredString(raw.toPeerId, "toPeerId");
    if (!toPeerId.ok) {
        return toPeerId;
    }
    if (type === "ICE_CANDIDATE") {
        const candidate = requiredString(raw.candidate, "candidate");
        if (!candidate.ok) {
            return candidate;
        }
        const sdpMid = optionalNullableString(raw.sdpMid, "sdpMid");
        if (!sdpMid.ok) {
            return sdpMid;
        }
        const sdpMLineIndex = optionalNullableNumber(raw.sdpMLineIndex, "sdpMLineIndex");
        if (!sdpMLineIndex.ok) {
            return sdpMLineIndex;
        }
        return {
            ok: true,
            value: {
                type,
                roomId: roomId.value,
                toPeerId: toPeerId.value,
                candidate: candidate.value,
                sdpMid: sdpMid.value,
                sdpMLineIndex: sdpMLineIndex.value,
            },
        };
    }
    const sdp = requiredString(raw.sdp, "sdp");
    if (!sdp.ok) {
        return sdp;
    }
    return {
        ok: true,
        value: {
            type,
            roomId: roomId.value,
            toPeerId: toPeerId.value,
            sdp: sdp.value,
        },
    };
}
function requiredString(value, field) {
    if (typeof value !== "string" || value.trim().length === 0) {
        return { ok: false, message: `${field} is required` };
    }
    return { ok: true, value };
}
function optionalNullableString(value, field) {
    if (value === undefined || value === null) {
        return { ok: true, value: null };
    }
    if (typeof value !== "string") {
        return { ok: false, message: `${field} must be a string or null` };
    }
    return { ok: true, value };
}
function optionalNullableNumber(value, field) {
    if (value === undefined || value === null) {
        return { ok: true, value: null };
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return { ok: false, message: `${field} must be a number or null` };
    }
    return { ok: true, value };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function send(socket, message) {
    if (socket.readyState !== ws_1.WebSocket.OPEN) {
        return;
    }
    socket.send(JSON.stringify(message));
}
//# sourceMappingURL=signaling.js.map