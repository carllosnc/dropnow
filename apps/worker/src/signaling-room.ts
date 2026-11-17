import { DurableObject } from 'cloudflare:workers';
import {
  ClientSignalingMessageSchema,
  type PeerInfo,
  type ServerSignalingMessage,
} from '@dropnow/shared';
import type { Env } from './env.js';

const PASSWORD_HASH_KEY = 'roomPasswordHash';
const HOST_PEER_ID_KEY = 'roomHostPeerId';

interface SocketAttachment extends PeerInfo {
  roomId: string;
}

async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
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
      await this.handleJoin(
        ws,
        payload.roomId,
        payload.peerId,
        payload.displayName,
        payload.password,
      );
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

    if (payload.type === 'shutdown-room') {
      await this.handleShutdown(ws, sender.peerId);
      return;
    }

    if (payload.type === 'update-name') {
      ws.serializeAttachment({
        ...sender,
        displayName: payload.displayName,
      });
      this.broadcast(
        {
          type: 'peer-updated',
          peer: { peerId: sender.peerId, displayName: payload.displayName },
        },
        ws,
      );
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
    await this.handleDisconnect(ws);
    try {
      ws.close(code, reason);
    } catch {
      // Socket may already be closed
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
    try {
      ws.close(1011, 'WebSocket error');
    } catch {
      // Socket may already be closed
    }
  }

  private async handleJoin(
    ws: WebSocket,
    roomId: string,
    peerId: string,
    displayName: string,
    password?: string,
  ): Promise<void> {
    if (this.getAttachment(ws)) {
      this.sendMessage(ws, {
        type: 'error',
        code: 'ALREADY_JOINED',
        message: 'This connection has already joined the room.',
      });
      return;
    }

    const existingPeers: PeerInfo[] = [];
    const socketsToReplace: WebSocket[] = [];

    for (const socket of this.ctx.getWebSockets()) {
      if (socket === ws) continue;
      const attachment = this.getAttachment(socket);
      if (!attachment) continue;

      if (attachment.peerId === peerId) {
        socketsToReplace.push(socket);
        continue;
      }

      existingPeers.push({
        peerId: attachment.peerId,
        displayName: attachment.displayName,
      });
    }

    const replacedSelf = socketsToReplace.length > 0;
    const normalizedPassword =
      password && password.length > 0 ? password : undefined;
    const storedHash = await this.ctx.storage.get<string>(PASSWORD_HASH_KEY);

    if ((existingPeers.length > 0 || replacedSelf) && storedHash) {
      if (!normalizedPassword) {
        this.sendMessage(ws, {
          type: 'error',
          code: 'PASSWORD_REQUIRED',
          message: 'This room requires a password.',
        });
        try {
          ws.close(4001, 'Password required');
        } catch {
          // Ignore close error
        }
        return;
      }

      const incomingHash = await hashPassword(normalizedPassword);
      if (incomingHash !== storedHash) {
        this.sendMessage(ws, {
          type: 'error',
          code: 'INVALID_PASSWORD',
          message: 'Incorrect room password.',
        });
        try {
          ws.close(4003, 'Invalid password');
        } catch {
          // Ignore close error
        }
        return;
      }
    } else if (existingPeers.length === 0 && !replacedSelf) {
      await this.ctx.storage.put(HOST_PEER_ID_KEY, peerId);
      if (normalizedPassword) {
        await this.ctx.storage.put(
          PASSWORD_HASH_KEY,
          await hashPassword(normalizedPassword),
        );
      } else {
        await this.ctx.storage.delete(PASSWORD_HASH_KEY);
      }
    }

    // Evict stale sockets with the same peerId only after authorization succeeds.
    // Clear attachment first so webSocketClose doesn't broadcast a spurious peer-left.
    for (const socket of socketsToReplace) {
      socket.serializeAttachment(null);
      try {
        socket.close(1000, 'Replaced by new session');
      } catch {
        // Ignore close error
      }
    }

    const hostPeerId =
      existingPeers.length === 0 && !replacedSelf
        ? peerId
        : await this.ctx.storage.get<string>(HOST_PEER_ID_KEY);

    const attachment: SocketAttachment = { roomId, peerId, displayName };
    ws.serializeAttachment(attachment);

    // Send current room peers to the newly joined peer
    this.sendMessage(ws, {
      type: 'room-peers',
      roomId,
      peers: existingPeers,
      isHost: hostPeerId === peerId,
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

  private async closeAllPeers(
    reason: string,
    closeReason: string,
    excludeWs?: WebSocket,
  ): Promise<void> {
    const closedPayload = JSON.stringify({
      type: 'room-closed',
      reason,
    } satisfies ServerSignalingMessage);

    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excludeWs) continue;
      const hasAttachment = Boolean(this.getAttachment(socket));
      socket.serializeAttachment(null);
      if (hasAttachment) {
        try {
          socket.send(closedPayload);
        } catch {
          // Socket might be closing/closed
        }
      }
      try {
        socket.close(4000, closeReason);
      } catch {
        // Ignore close error
      }
    }

    await this.ctx.storage.delete(PASSWORD_HASH_KEY);
    await this.ctx.storage.delete(HOST_PEER_ID_KEY);
  }

  private async handleShutdown(
    ws: WebSocket,
    senderPeerId: string,
  ): Promise<void> {
    const hostPeerId = await this.ctx.storage.get<string>(HOST_PEER_ID_KEY);
    if (hostPeerId !== senderPeerId) {
      this.sendMessage(ws, {
        type: 'error',
        code: 'FORBIDDEN',
        message: 'Only the room host can shut down the room.',
      });
      return;
    }

    await this.closeAllPeers('The host closed this room.', 'Room closed by host');
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    const attachment = this.getAttachment(ws);
    if (!attachment) return;

    // Clear attachment so duplicate close/error events don't emit twice
    ws.serializeAttachment(null);

    const hostPeerId = await this.ctx.storage.get<string>(HOST_PEER_ID_KEY);
    if (hostPeerId === attachment.peerId) {
      await this.closeAllPeers(
        'The host left this room.',
        'Host left the room',
        ws,
      );
      return;
    }

    this.broadcast(
      {
        type: 'peer-left',
        peerId: attachment.peerId,
      },
      ws,
    );

    if (!this.hasActivePeers(ws)) {
      await this.ctx.storage.delete(PASSWORD_HASH_KEY);
      await this.ctx.storage.delete(HOST_PEER_ID_KEY);
    }
  }

  private hasActivePeers(excludeWs?: WebSocket): boolean {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excludeWs) continue;
      if (this.getAttachment(socket)) {
        return true;
      }
    }
    return false;
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
