"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_http_1 = require("node:http");
const node_path_1 = __importDefault(require("node:path"));
const ws_1 = require("ws");
const room_manager_js_1 = require("./room-manager.js");
const signaling_js_1 = require("./signaling.js");
const PORT = Number(process.env.PORT) || 3000;
const clientDir = resolveClientDir();
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};
const rooms = new room_manager_js_1.RoomManager();
const httpServer = (0, node_http_1.createServer)((req, res) => {
    void serveRequest(req, res);
});
const wss = new ws_1.WebSocketServer({ server: httpServer });
(0, signaling_js_1.attachSignaling)(wss, rooms);
httpServer.listen(PORT, () => {
    console.log(`WebRTC signaling server listening on ws://localhost:${PORT}`);
    console.log(`Client UI: http://localhost:${PORT}`);
});
async function serveRequest(req, res) {
    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", service: "webrtc-signaling" }));
        return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") {
        pathname = "/login.html";
    }
    const relative = pathname.replace(/^[/\\]+/, "");
    const resolved = node_path_1.default.resolve(clientDir, relative);
    const outside = node_path_1.default.relative(clientDir, resolved).startsWith("..") || node_path_1.default.isAbsolute(node_path_1.default.relative(clientDir, resolved));
    if (outside) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }
    if (!(0, node_fs_1.existsSync)(resolved) || !(0, node_fs_1.statSync)(resolved).isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
    }
    const ext = node_path_1.default.extname(resolved).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    (0, node_fs_1.createReadStream)(resolved).pipe(res);
}
function resolveClientDir() {
    const candidates = [
        node_path_1.default.resolve(process.cwd(), "../client"),
        node_path_1.default.resolve(process.cwd(), "client"),
    ];
    for (const dir of candidates) {
        if ((0, node_fs_1.existsSync)(node_path_1.default.join(dir, "login.html"))) {
            return dir;
        }
    }
    return candidates[0];
}
//# sourceMappingURL=server.js.map