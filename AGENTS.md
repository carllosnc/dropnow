# Project Rules — DropNow

## Package Manager & Runtime
- **Always use `bun` and `bunx`** instead of `npm`, `npx`, `pnpm`, `yarn`, or `node` for installing dependencies, running scripts, executing CLI tools, and running TypeScript/JavaScript files.
  - Install dependencies: `bun install` / `bun add <pkg>`
  - Run workspace scripts: `bun run <script>`
  - Execute binaries: `bunx <cli>` (e.g., `bunx wrangler ...`)

## Language
- **Write everything in English**: all source code, comments, documentation, rule files, error messages, and UI copy must be in English.

## Architecture & Code Standards
- **Strict TypeScript**: keep `strict: true` and `noUncheckedIndexedAccess: true` enabled across all workspaces.
- **Zero Server Storage**: files must travel strictly peer-to-peer over WebRTC `RTCDataChannel`; never persist files or transfer metadata in Cloudflare R2, S3, D1, KV, or disk.
- **Signaling & Validation**: validate all WebSocket signaling messages and DataChannel control payloads at runtime using Zod schemas from `@dropnow/shared`.
- **Native WebRTC**: use native browser `RTCPeerConnection` and `RTCDataChannel` APIs directly (no PeerJS, Simple-Peer, or similar wrappers), with chunked streaming and `bufferedAmount` backpressure control.
