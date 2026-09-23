import type { SignalingClient } from "./websocket.js";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type RemoteTrackHandler = (peerId: string, stream: MediaStream) => void;
export type PeerClosedHandler = (peerId: string) => void;

interface PeerSession {
  connection: RTCPeerConnection;
  iceQueue: RTCIceCandidateInit[];
}

export class MeshPeerManager {
  private readonly peers = new Map<string, PeerSession>();
  private localStream: MediaStream | null = null;

  constructor(
    private readonly signaling: SignalingClient,
    private readonly roomId: string,
    private readonly onRemoteTrack: RemoteTrackHandler,
    private readonly onPeerClosed: PeerClosedHandler,
  ) {}

  setLocalStream(stream: MediaStream): void {
    this.localStream = stream;
    for (const session of this.peers.values()) {
      this.replaceTracks(session.connection, stream);
    }
  }

  async connectToPeer(peerId: string): Promise<void> {
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

  ensurePeer(peerId: string): void {
    this.getOrCreatePeer(peerId);
  }

  async handleOffer(fromPeerId: string, sdp: string): Promise<void> {
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

  async handleAnswer(fromPeerId: string, sdp: string): Promise<void> {
    const session = this.peers.get(fromPeerId);
    if (!session) {
      return;
    }
    await session.connection.setRemoteDescription({ type: "answer", sdp });
    await this.flushIce(session);
  }

  async handleIce(
    fromPeerId: string,
    candidate: string,
    sdpMid: string | null,
    sdpMLineIndex: number | null,
  ): Promise<void> {
    const session = this.getOrCreatePeer(fromPeerId);
    const init: RTCIceCandidateInit = {
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

  removePeer(peerId: string): void {
    const session = this.peers.get(peerId);
    if (!session) {
      return;
    }
    session.connection.close();
    this.peers.delete(peerId);
    this.onPeerClosed(peerId);
  }

  closeAll(): void {
    for (const peerId of [...this.peers.keys()]) {
      this.removePeer(peerId);
    }
  }

  peerCount(): number {
    return this.peers.size;
  }

  private getOrCreatePeer(peerId: string): PeerSession {
    const existing = this.peers.get(peerId);
    if (existing) {
      return existing;
    }

    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const session: PeerSession = { connection, iceQueue: [] };
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

  private async flushIce(session: PeerSession): Promise<void> {
    const queued = session.iceQueue.splice(0);
    for (const candidate of queued) {
      await session.connection.addIceCandidate(candidate);
    }
  }

  private replaceTracks(connection: RTCPeerConnection, stream: MediaStream): void {
    const senders = connection.getSenders();
    for (const track of stream.getTracks()) {
      const sender = senders.find((item) => item.track?.kind === track.kind);
      if (sender) {
        void sender.replaceTrack(track);
      } else {
        connection.addTrack(track, stream);
      }
    }
  }
}
