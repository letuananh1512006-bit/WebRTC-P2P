import { SIGNALING_URL, } from "./types.js";
export class SignalingClient {
    socket = null;
    handlers = new Set();
    connect(url = SIGNALING_URL) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(url);
            this.socket = socket;
            socket.addEventListener("open", () => resolve(), { once: true });
            socket.addEventListener("error", () => reject(new Error("WebSocket connection failed")), { once: true });
            socket.addEventListener("message", (event) => {
                if (typeof event.data !== "string") {
                    return;
                }
                let parsed;
                try {
                    parsed = JSON.parse(event.data);
                }
                catch {
                    return;
                }
                if (!isServerMessage(parsed)) {
                    return;
                }
                for (const handler of this.handlers) {
                    handler(parsed);
                }
            });
        });
    }
    onMessage(handler) {
        this.handlers.add(handler);
        return () => {
            this.handlers.delete(handler);
        };
    }
    send(message) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("Signaling socket is not open");
        }
        this.socket.send(JSON.stringify(message));
    }
    close() {
        this.socket?.close();
        this.socket = null;
        this.handlers.clear();
    }
}
function isServerMessage(value) {
    if (typeof value !== "object" || value === null || !("type" in value)) {
        return false;
    }
    const type = value.type;
    return (type === "ROOM_JOINED" ||
        type === "USER_JOINED" ||
        type === "USER_LEFT" ||
        type === "OFFER" ||
        type === "ANSWER" ||
        type === "ICE_CANDIDATE" ||
        type === "ERROR");
}
//# sourceMappingURL=websocket.js.map