import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";
import { RoomManager } from "./room-manager.js";
import { attachSignaling } from "./signaling.js";

const PORT = Number(process.env.PORT) || 3000;
const clientDir = resolveClientDir();

const MIME: Record<string, string> = {
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

const rooms = new RoomManager();
const httpServer = createServer((req, res) => {
  void serveRequest(req, res);
});

const wss = new WebSocketServer({ server: httpServer });
attachSignaling(wss, rooms);

httpServer.listen(PORT, () => {
  console.log(`WebRTC signaling server listening on ws://localhost:${PORT}`);
  console.log(`Client UI: http://localhost:${PORT}`);
});

async function serveRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
  const resolved = path.resolve(clientDir, relative);
  const outside = path.relative(clientDir, resolved).startsWith("..") || path.isAbsolute(path.relative(clientDir, resolved));
  if (outside) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  createReadStream(resolved).pipe(res);
}

function resolveClientDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "../client"),
    path.resolve(process.cwd(), "client"),
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "login.html"))) {
      return dir;
    }
  }
  return candidates[0];
}
