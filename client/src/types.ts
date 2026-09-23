export const SIGNALING_URL = "ws://localhost:3000";

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

export interface ErrorMessage {
  type: "ERROR";
  message: string;
}

export type ClientSignalMessage =
  | JoinRoomMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage;

export type ServerSignalMessage =
  | RoomJoinedMessage
  | UserJoinedMessage
  | UserLeftMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | ErrorMessage;

export interface SessionUser {
  userId: string;
  username: string;
}
