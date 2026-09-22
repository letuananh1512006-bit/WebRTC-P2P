import { type WebSocketServer } from "ws";
import type { RoomManager } from "./room-manager.js";
export declare function attachSignaling(wss: WebSocketServer, rooms: RoomManager): void;
