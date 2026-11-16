import { DurableObject } from 'cloudflare:workers';
import {
  ClientSignalingMessageSchema,
  type PeerInfo,
  type ServerSignalingMessage,
} from '@dropnow/shared';
import type { Env } from './env.js';

interface SocketAttachment extends PeerInfo {
  roomId: string;
}

export class SignalingRoom extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // Accept the WebSocket using the Hibernation API so the DO consumes zero CPU while idle
    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof message !== 'string') {
      this.sendMessage(ws, {
        type: 'error',
        code: 'UNSUPPORTED_FORMAT',
        message: 'Signaling messages must be UTF-8 JSON strings.',
      });
      return;
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(message);
    } catch {
      this.sendMessage(ws, {
        type: 'error',
        code: 'INVALID_JSON',
        message: 'Malformed JSON payload.',
      });
      return;
    }

    const parsed = ClientSignalingMessageSchema.safeParse(rawJson);
    if (!parsed.success) {
      this.sendMessage(ws, {
        type: 'error',
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
      return;
    }

    const payload = parsed.data;

    if (payload.type === 'join') {
      this.handleJoin(ws, payload.roomId, payload.peerId, payload.displayName);
      return;
    }

    const sender = this.getAttachment(ws);
    if (!sender) {
      this.sendMessage(ws, {
        type: 'error',
        code: 'NOT_JOINED',
        message: 'You must send a join message before signaling.',
      });
      return;
    }

    const targetSocket = this.findSocketByPeerId(payload.targetPeerId, ws);
    if (!targetSocket) {
      this.sendMessage(ws, {
        type: 'error',
        code: 'PEER_NOT_FOUND',
        message: `Target peer "${payload.targetPeerId}" is not in the room.`,
      });
      return;
    }

    switch (payload.type) {
      case 'offer':
        this.sendMessage(targetSocket, {
          type: 'offer',
          fromPeerId: sender.peerId,
          sdp: payload.sdp,
        });
        break;
      case 'answer':
        this.sendMessage(targetSocket, {
          type: 'answer',
          fromPeerId: sender.peerId,
          sdp: payload.sdp,
        });
        break;
      case 'ice-candidate':
        this.sendMessage(targetSocket, {
          type: 'ice-candidate',
          fromPeerId: sender.peerId,
          candidate: payload.candidate,
        });
        break;
    }
  }

  override async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    this.handleDisconnect(ws);
    try {
      ws.close(code, reason);
    } catch {
      // Socket may already be closed
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.handleDisconnect(ws);
    try {
      ws.close(1011, 'WebSocket error');
    } catch {
      // Socket may already be closed
    }
  }

  private handleJoin(
    ws: WebSocket,
    roomId: string,
    peerId: string,
    displayName: string,
  ): void {
    const existingPeers: PeerInfo[] = [];

    for (const socket of this.ctx.getWebSockets()) {
      if (socket === ws) continue;
      const attachment = this.getAttachment(socket);
      if (!attachment) continue;

      if (attachment.peerId === peerId) {
        // Evict stale socket with the same peerId (e.g. quick page reload)
        // Clear attachment first so webSocketClose doesn't broadcast a spurious peer-left
        socket.serializeAttachment(null);
        try {
          socket.close(1000, 'Replaced by new session');
        } catch {
          // Ignore close error
        }
        continue;
      }

      existingPeers.push({
        peerId: attachment.peerId,
        displayName: attachment.displayName,
      });
    }

    const attachment: SocketAttachment = { roomId, peerId, displayName };
    ws.serializeAttachment(attachment);

    // Send current room peers to the newly joined peer
    this.sendMessage(ws, {
      type: 'room-peers',
      roomId,
      peers: existingPeers,
    });

    // Broadcast arrival to all other peers in the room
    this.broadcast(
      {
        type: 'peer-joined',
        peer: { peerId, displayName },
      },
      ws,
    );
  }

  private handleDisconnect(ws: WebSocket): void {
    const attachment = this.getAttachment(ws);
    if (!attachment) return;

    // Clear attachment so duplicate close/error events don't emit twice
    ws.serializeAttachment(null);

    this.broadcast(
      {
        type: 'peer-left',
        peerId: attachment.peerId,
      },
      ws,
    );
  }

  private getAttachment(ws: WebSocket): SocketAttachment | null {
    const raw = ws.deserializeAttachment();
    if (!raw || typeof raw !== 'object') return null;
    const candidate = raw as Partial<SocketAttachment>;
    if (
      typeof candidate.peerId === 'string' &&
      typeof candidate.displayName === 'string' &&
      typeof candidate.roomId === 'string'
    ) {
      return {
        roomId: candidate.roomId,
        peerId: candidate.peerId,
        displayName: candidate.displayName,
      };
    }
    return null;
  }

  private findSocketByPeerId(
    targetPeerId: string,
    excludeWs: WebSocket,
  ): WebSocket | null {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excludeWs) continue;
      const attachment = this.getAttachment(socket);
      if (attachment?.peerId === targetPeerId) {
        return socket;
      }
    }
    return null;
  }

  private sendMessage(ws: WebSocket, message: ServerSignalingMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Socket might be closing/closed
    }
  }

  private broadcast(
    message: ServerSignalingMessage,
    excludeWs?: WebSocket,
  ): void {
    const encoded = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excludeWs) continue;
      if (!this.getAttachment(socket)) continue;
      try {
        socket.send(encoded);
      } catch {
        // Socket might be closing/closed
      }
    }
  }
}
