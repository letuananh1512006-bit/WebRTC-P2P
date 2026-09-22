import type { WebSocket } from "ws";

export type SignalType =
  | "JOIN_ROOM"
  | "ROOM_JOINED"
  | "USER_JOINED"
  | "USER_LEFT"
  | "OFFER"
  | "ANSWER"
  | "ICE_CANDIDATE";

export interface Peer {
  peerId: string;
  roomId: string;
  socket: WebSocket;
}

export interface JoinRoomMessage {
  type: "JOIN_ROOM";
  roomId: string;
  peerId?: string;
}

export interface RoomJoinedMessage {
  type: "ROOM_JOINED";
  roomId: string;
  peerId: string;
  peers: string[];
}

export interface UserJoinedMessage {
  type: "USER_JOINED";
  roomId: string;
  peerId: string;
}

export interface UserLeftMessage {
  type: "USER_LEFT";
  roomId: string;
  peerId: string;
}

/** fromPeerId is optional on inbound messages; the server always overwrites it. */
export interface OfferMessage {
  type: "OFFER";
  roomId: string;
  fromPeerId?: string;
  toPeerId: string;
  sdp: string;
}

export interface AnswerMessage {
  type: "ANSWER";
  roomId: string;
  fromPeerId?: string;
  toPeerId: string;
  sdp: string;
}

export interface IceCandidateMessage {
  type: "ICE_CANDIDATE";
  roomId: string;
  fromPeerId?: string;
  toPeerId: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export type ClientMessage =
  | JoinRoomMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage;

export type ServerMessage =
  | RoomJoinedMessage
  | UserJoinedMessage
  | UserLeftMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage;

export interface ErrorMessage {
  type: "ERROR";
  message: string;
}
