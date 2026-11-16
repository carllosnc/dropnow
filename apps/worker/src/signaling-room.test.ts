import { describe, expect, it, mock } from 'bun:test';

class MockDurableObject {
  protected ctx: unknown;
  protected env: unknown;

  constructor(ctx: unknown, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }
}

void mock.module('cloudflare:workers', () => ({
  DurableObject: MockDurableObject,
}));

const { SignalingRoom } = await import('./signaling-room.js');

interface MockSocket {
  sent: string[];
  closed: boolean;
  closeCode?: number;
  closeReason?: string;
  attachment: unknown;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

function createMockSocket(): MockSocket {
  return {
    sent: [],
    closed: false,
    attachment: null,
    send(data: string) {
      this.sent.push(data);
    },
    close(code?: number, reason?: string) {
      this.closed = true;
      this.closeCode = code;
      this.closeReason = reason;
    },
    serializeAttachment(value: unknown) {
      this.attachment = value;
    },
    deserializeAttachment() {
      return this.attachment;
    },
  };
}

function createMockRoom() {
  const sockets: MockSocket[] = [];
  const ctx = {
    acceptWebSocket(ws: MockSocket) {
      sockets.push(ws);
    },
    getWebSockets() {
      return sockets.filter((s) => !s.closed);
    },
  };

  const room = new SignalingRoom(
    ctx as unknown as DurableObjectState,
    {} as never,
  );

  const addPeerSocket = (ws: MockSocket) => {
    sockets.push(ws);
    return ws as unknown as WebSocket;
  };

  return { room, sockets, addPeerSocket };
}

describe('SignalingRoom', () => {
  it('returns 426 when fetch is not a WebSocket upgrade', async () => {
    const { room } = createMockRoom();
    const res = await room.fetch(new Request('https://example.com/ws/room-1'));
    expect(res.status).toBe(426);
  });

  it('rejects malformed JSON and invalid payloads', async () => {
    const { room, addPeerSocket } = createMockRoom();
    const mockWs = createMockSocket();
    const ws = addPeerSocket(mockWs);

    await room.webSocketMessage(ws, '{not-json');
    expect(JSON.parse(mockWs.sent[0] ?? '{}')).toMatchObject({
      type: 'error',
      code: 'INVALID_JSON',
    });

    await room.webSocketMessage(ws, JSON.stringify({ type: 'unknown' }));
    expect(JSON.parse(mockWs.sent[1] ?? '{}')).toMatchObject({
      type: 'error',
      code: 'VALIDATION_ERROR',
    });
  });

  it('requires join before relaying signaling messages', async () => {
    const { room, addPeerSocket } = createMockRoom();
    const mockWs = createMockSocket();
    const ws = addPeerSocket(mockWs);

    await room.webSocketMessage(
      ws,
      JSON.stringify({
        type: 'offer',
        targetPeerId: 'peer_2',
        sdp: { type: 'offer', sdp: 'v=0' },
      }),
    );

    expect(JSON.parse(mockWs.sent[0] ?? '{}')).toMatchObject({
      type: 'error',
      code: 'NOT_JOINED',
    });
  });

  it('handles join, relays offer/answer/ice-candidate, and broadcasts peer-left', async () => {
    const { room, addPeerSocket } = createMockRoom();
    const mockWsA = createMockSocket();
    const mockWsB = createMockSocket();
    const wsA = addPeerSocket(mockWsA);
    const wsB = addPeerSocket(mockWsB);

    // Peer A joins
    await room.webSocketMessage(
      wsA,
      JSON.stringify({
        type: 'join',
        roomId: 'room-1',
        peerId: 'peer_aaaa',
        displayName: 'Alpha',
      }),
    );
    expect(JSON.parse(mockWsA.sent[0] ?? '{}')).toEqual({
      type: 'room-peers',
      roomId: 'room-1',
      peers: [],
    });

    // Peer B joins
    await room.webSocketMessage(
      wsB,
      JSON.stringify({
        type: 'join',
        roomId: 'room-1',
        peerId: 'peer_bbbb',
        displayName: 'Beta',
      }),
    );

    expect(JSON.parse(mockWsB.sent[0] ?? '{}')).toEqual({
      type: 'room-peers',
      roomId: 'room-1',
      peers: [{ peerId: 'peer_aaaa', displayName: 'Alpha' }],
    });
    expect(JSON.parse(mockWsA.sent[1] ?? '{}')).toEqual({
      type: 'peer-joined',
      peer: { peerId: 'peer_bbbb', displayName: 'Beta' },
    });

    // Peer A sends offer to Peer B
    await room.webSocketMessage(
      wsA,
      JSON.stringify({
        type: 'offer',
        targetPeerId: 'peer_bbbb',
        sdp: { type: 'offer', sdp: 'v=0-offer' },
      }),
    );
    expect(JSON.parse(mockWsB.sent[1] ?? '{}')).toEqual({
      type: 'offer',
      fromPeerId: 'peer_aaaa',
      sdp: { type: 'offer', sdp: 'v=0-offer' },
    });

    // Peer B disconnects
    await room.webSocketClose(wsB, 1000, 'Normal closure');
    expect(JSON.parse(mockWsA.sent[2] ?? '{}')).toEqual({
      type: 'peer-left',
      peerId: 'peer_bbbb',
    });
  });

  it('returns PEER_NOT_FOUND when target peer is absent', async () => {
    const { room, addPeerSocket } = createMockRoom();
    const mockWsA = createMockSocket();
    const wsA = addPeerSocket(mockWsA);

    await room.webSocketMessage(
      wsA,
      JSON.stringify({
        type: 'join',
        roomId: 'room-1',
        peerId: 'peer_aaaa',
        displayName: 'Alpha',
      }),
    );

    await room.webSocketMessage(
      wsA,
      JSON.stringify({
        type: 'ice-candidate',
        targetPeerId: 'peer_missing',
        candidate: { candidate: 'candidate:1' },
      }),
    );

    expect(JSON.parse(mockWsA.sent[1] ?? '{}')).toMatchObject({
      type: 'error',
      code: 'PEER_NOT_FOUND',
    });
  });

  it('evicts stale socket with same peerId without broadcasting peer-left', async () => {
    const { room, addPeerSocket } = createMockRoom();
    const mockWsA1 = createMockSocket();
    const mockWsB = createMockSocket();
    const mockWsA2 = createMockSocket();
    const wsA1 = addPeerSocket(mockWsA1);
    const wsB = addPeerSocket(mockWsB);
    const wsA2 = addPeerSocket(mockWsA2);

    await room.webSocketMessage(
      wsA1,
      JSON.stringify({
        type: 'join',
        roomId: 'room-1',
        peerId: 'peer_aaaa',
        displayName: 'Alpha',
      }),
    );
    await room.webSocketMessage(
      wsB,
      JSON.stringify({
        type: 'join',
        roomId: 'room-1',
        peerId: 'peer_bbbb',
        displayName: 'Beta',
      }),
    );

    // Same peerId reconnects on a new socket
    await room.webSocketMessage(
      wsA2,
      JSON.stringify({
        type: 'join',
        roomId: 'room-1',
        peerId: 'peer_aaaa',
        displayName: 'Alpha',
      }),
    );

    // Simulate delayed close event from the evicted socket
    await room.webSocketClose(wsA1, 1000, 'Replaced by new session');

    const messagesForB = mockWsB.sent.map((raw) => JSON.parse(raw) as { type: string });
    expect(messagesForB.some((m) => m.type === 'peer-left')).toBe(false);
    expect(mockWsA1.closed).toBe(true);
  });
});
