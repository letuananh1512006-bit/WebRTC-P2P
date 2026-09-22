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
export declare class RoomManager {
    private readonly rooms;
    private readonly socketToPeer;
    createRoom(roomId?: string): string;
    hasRoom(roomId: string): boolean;
    hasPeer(roomId: string, peerId: string): boolean;
    /**
     * Join room: tạo room nếu chưa có.
     * Một socket chỉ thuộc một room tại một thời điểm.
     * peerId không được trùng trong cùng room (socket khác).
     */
    joinRoom(roomId: string, socket: WebSocket, peerId?: string): JoinResult;
    leaveRoom(socket: WebSocket): Peer | undefined;
    getPeer(socket: WebSocket): Peer | undefined;
    getPeerById(roomId: string, peerId: string): Peer | undefined;
    getPeers(roomId: string): Peer[];
    getPeerIds(roomId: string, exceptPeerId?: string): string[];
    /**
     * Relay chỉ khi:
     * - sender đang trong room (theo socket, không tin client)
     * - roomId client gửi khớp room hiện tại
     * - target cùng room, còn tồn tại, WebSocket OPEN
     */
    resolveRelayTarget(socket: WebSocket, claimedRoomId: string, toPeerId: string): RelayResult;
}
