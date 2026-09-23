const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
];
export class MeshPeerManager {
    signaling;
    roomId;
    onRemoteTrack;
    onPeerClosed;
    peers = new Map();
    localStream = null;
    constructor(signaling, roomId, onRemoteTrack, onPeerClosed) {
        this.signaling = signaling;
        this.roomId = roomId;
        this.onRemoteTrack = onRemoteTrack;
        this.onPeerClosed = onPeerClosed;
    }
    setLocalStream(stream) {
        this.localStream = stream;
        for (const session of this.peers.values()) {
            this.replaceTracks(session.connection, stream);
        }
    }
    async connectToPeer(peerId) {
        const session = this.getOrCreatePeer(peerId);
        const offer = await session.connection.createOffer();
        await session.connection.setLocalDescription(offer);
        if (!offer.sdp) {
            return;
        }
        this.signaling.send({
            type: "OFFER",
            roomId: this.roomId,
            toPeerId: peerId,
            sdp: offer.sdp,
        });
    }
    ensurePeer(peerId) {
        this.getOrCreatePeer(peerId);
    }
    async handleOffer(fromPeerId, sdp) {
        const session = this.getOrCreatePeer(fromPeerId);
        await session.connection.setRemoteDescription({ type: "offer", sdp });
        await this.flushIce(session);
        const answer = await session.connection.createAnswer();
        await session.connection.setLocalDescription(answer);
        if (!answer.sdp) {
            return;
        }
        this.signaling.send({
            type: "ANSWER",
            roomId: this.roomId,
            toPeerId: fromPeerId,
            sdp: answer.sdp,
        });
    }
    async handleAnswer(fromPeerId, sdp) {
        const session = this.peers.get(fromPeerId);
        if (!session) {
            return;
        }
        await session.connection.setRemoteDescription({ type: "answer", sdp });
        await this.flushIce(session);
    }
    async handleIce(fromPeerId, candidate, sdpMid, sdpMLineIndex) {
        const session = this.getOrCreatePeer(fromPeerId);
        const init = {
            candidate,
            sdpMid,
            sdpMLineIndex: sdpMLineIndex ?? undefined,
        };
        if (!session.connection.remoteDescription) {
            session.iceQueue.push(init);
            return;
        }
        await session.connection.addIceCandidate(init);
    }
    removePeer(peerId) {
        const session = this.peers.get(peerId);
        if (!session) {
            return;
        }
        session.connection.close();
        this.peers.delete(peerId);
        this.onPeerClosed(peerId);
    }
    closeAll() {
        for (const peerId of [...this.peers.keys()]) {
            this.removePeer(peerId);
        }
    }
    peerCount() {
        return this.peers.size;
    }
    getOrCreatePeer(peerId) {
        const existing = this.peers.get(peerId);
        if (existing) {
            return existing;
        }
        const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const session = { connection, iceQueue: [] };
        this.peers.set(peerId, session);
        if (this.localStream) {
            for (const track of this.localStream.getTracks()) {
                connection.addTrack(track, this.localStream);
            }
        }
        connection.onicecandidate = (event) => {
            const ice = event.candidate;
            if (!ice || ice.candidate.trim().length === 0) {
                return;
            }
            this.signaling.send({
                type: "ICE_CANDIDATE",
                roomId: this.roomId,
                toPeerId: peerId,
                candidate: ice.candidate,
                sdpMid: ice.sdpMid,
                sdpMLineIndex: ice.sdpMLineIndex,
            });
        };
        connection.ontrack = (event) => {
            const stream = event.streams[0] ?? new MediaStream([event.track]);
            this.onRemoteTrack(peerId, stream);
        };
        return session;
    }
    async flushIce(session) {
        const queued = session.iceQueue.splice(0);
        for (const candidate of queued) {
            await session.connection.addIceCandidate(candidate);
        }
    }
    replaceTracks(connection, stream) {
        const senders = connection.getSenders();
        for (const track of stream.getTracks()) {
            const sender = senders.find((item) => item.track?.kind === track.kind);
            if (sender) {
                void sender.replaceTrack(track);
            }
            else {
                connection.addTrack(track, stream);
            }
        }
    }
}
//# sourceMappingURL=webrtc.js.map