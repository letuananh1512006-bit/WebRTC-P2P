# WebRTC P2P Mesh — Signaling Server

TypeScript WebSocket signaling server for a WebRTC **P2P mesh**. The server does not carry camera or microphone media. Peers exchange SDP and ICE through this process, then send media client-to-client.

## Layout

```
WebRTC-P2P/
├── server/
│   ├── src/
│   │   ├── server.ts
│   │   ├── signaling.ts
│   │   ├── room-manager.ts
│   │   ├── room-manager.test.ts
│   │   └── types.ts
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

## Run the server

```bash
cd server
npm install
npm run build
npm start
```

- HTTP: `http://localhost:3000`
- WebSocket: `ws://localhost:3000`

## Tests

```bash
cd server
npx tsx src/room-manager.test.ts
```
