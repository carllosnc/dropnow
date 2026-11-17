# DropNow

[![CI](https://github.com/carllosnc/dropnow/actions/workflows/ci.yml/badge.svg)](https://github.com/carllosnc/dropnow/actions/workflows/ci.yml)
[![Live Demo](https://img.shields.io/badge/demo-live-2563EB?style=flat&logo=cloudflareworkers&logoColor=white)](https://dropnow.carllos-nc.workers.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-111111?style=flat)](LICENSE)
[![WebRTC](https://img.shields.io/badge/WebRTC-DataChannel-333333?style=flat&logo=webrtc&logoColor=white)](https://webrtc.org/)

Real-time peer-to-peer browser file transfer with zero server-side file storage.

DropNow connects devices in a shared room via WebSockets for signaling and transfers files directly between browsers over native WebRTC `RTCDataChannel`s.

## Features

- **Direct P2P Transfers:** Files travel strictly browser-to-browser over WebRTC `RTCDataChannel` with 64 KB chunk framing and `bufferedAmount` backpressure control.
- **Zero Server Storage:** No files or transfer metadata are ever persisted to R2, S3, D1, KV, or disk on the server.
- **Streaming Disk Writes:** Uses the File System Access API (`showSaveFilePicker`) when supported, with automatic in-memory `Blob` fallback.
- **Low-Idle-Cost Signaling:** Built on Cloudflare Workers + Durable Objects using the WebSocket Hibernation API (`SignalingRoom`).
- **NAT Traversal Ready:** Supports ephemeral Cloudflare Realtime TURN credentials (`/api/turn-credentials`) with automatic STUN fallback.
- **Runtime Validation:** All signaling messages and DataChannel control payloads are validated with Zod schemas from `@dropnow/shared`.

## Monorepo Structure

```text
dropnow/
├── packages/
│   └── shared/       # Shared Zod schemas and TypeScript types (@dropnow/shared)
├── apps/
│   ├── worker/       # Cloudflare Worker (Hono API + SignalingRoom Durable Object)
│   └── web/          # React + Vite + Tailwind CSS frontend
└── .github/
    └── workflows/    # GitHub Actions CI
```

## Prerequisites

- [Bun](https://bun.sh/) `>= 1.0.0`
- [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/) (included as a workspace dependency via `bunx wrangler`) for deployment

## Getting Started

Install dependencies:

```bash
bun install
```

Start the Worker and Web dev servers concurrently:

```bash
bun run dev
```

Run typechecking, tests, and production builds:

```bash
bun run typecheck
bun run test
bun run build
```

## Optional TURN Configuration

By default, `/api/turn-credentials` falls back to public STUN servers (`stun.cloudflare.com` and `stun.l.google.com`). To enable Cloudflare Realtime TURN for strict NAT/firewall environments:

1. Copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars` for local development and fill in `TURN_KEY_ID` and `TURN_KEY_API_TOKEN`.
2. For production, set them as Worker secrets:

```bash
bunx wrangler secret put TURN_KEY_ID --config apps/worker/wrangler.toml
bunx wrangler secret put TURN_KEY_API_TOKEN --config apps/worker/wrangler.toml
```

## Deployment

Build the frontend and deploy the Cloudflare Worker + static assets:

```bash
bun run deploy
```

## License

[MIT](./LICENSE)
