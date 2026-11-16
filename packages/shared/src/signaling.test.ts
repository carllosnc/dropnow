import { describe, expect, it } from 'bun:test';
import {
  ClientSignalingMessageSchema,
  RoomIdSchema,
  ServerSignalingMessageSchema,
  TurnCredentialsResponseSchema,
} from './signaling.js';

describe('RoomIdSchema', () => {
  it('accepts valid room IDs', () => {
    expect(RoomIdSchema.safeParse('room-123_abc').success).toBe(true);
    expect(RoomIdSchema.safeParse('abc').success).toBe(true);
  });

  it('rejects too short or invalid characters', () => {
    expect(RoomIdSchema.safeParse('ab').success).toBe(false);
    expect(RoomIdSchema.safeParse('room/123').success).toBe(false);
    expect(RoomIdSchema.safeParse('room 123').success).toBe(false);
  });
});

describe('ClientSignalingMessageSchema', () => {
  it('validates join message', () => {
    const result = ClientSignalingMessageSchema.safeParse({
      type: 'join',
      roomId: 'room-1',
      peerId: 'peer_1234',
      displayName: 'Swift Falcon',
    });
    expect(result.success).toBe(true);
  });

  it('validates offer and answer messages', () => {
    const offer = ClientSignalingMessageSchema.safeParse({
      type: 'offer',
      targetPeerId: 'peer_5678',
      sdp: { type: 'offer', sdp: 'v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\n' },
    });
    expect(offer.success).toBe(true);

    const answer = ClientSignalingMessageSchema.safeParse({
      type: 'answer',
      targetPeerId: 'peer_5678',
      sdp: { type: 'answer', sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\n' },
    });
    expect(answer.success).toBe(true);
  });

  it('validates ice-candidate message', () => {
    const result = ClientSignalingMessageSchema.safeParse({
      type: 'ice-candidate',
      targetPeerId: 'peer_5678',
      candidate: {
        candidate: 'candidate:1 1 UDP 2122260223 192.168.1.2 54321 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects mismatched SDP type or unknown message type', () => {
    const badOffer = ClientSignalingMessageSchema.safeParse({
      type: 'offer',
      targetPeerId: 'peer_5678',
      sdp: { type: 'answer', sdp: 'v=0' },
    });
    expect(badOffer.success).toBe(false);

    const unknown = ClientSignalingMessageSchema.safeParse({
      type: 'ping',
    });
    expect(unknown.success).toBe(false);
  });
});

describe('ServerSignalingMessageSchema', () => {
  it('validates room-peers, peer-joined, and peer-left', () => {
    expect(
      ServerSignalingMessageSchema.safeParse({
        type: 'room-peers',
        roomId: 'room-1',
        peers: [{ peerId: 'peer_1234', displayName: 'Solar Fox' }],
      }).success,
    ).toBe(true);

    expect(
      ServerSignalingMessageSchema.safeParse({
        type: 'peer-joined',
        peer: { peerId: 'peer_5678', displayName: 'Amber Otter' },
      }).success,
    ).toBe(true);

    expect(
      ServerSignalingMessageSchema.safeParse({
        type: 'peer-left',
        peerId: 'peer_5678',
      }).success,
    ).toBe(true);
  });
});

describe('TurnCredentialsResponseSchema', () => {
  it('validates TURN response payload', () => {
    const parsed = TurnCredentialsResponseSchema.safeParse({
      iceServers: [
        { urls: 'stun:stun.cloudflare.com:3478' },
        {
          urls: ['turn:turn.cloudflare.com:3478?transport=udp'],
          username: 'u1',
          credential: 'c1',
        },
      ],
      turnEnabled: true,
      ttl: 86400,
    });
    expect(parsed.success).toBe(true);
  });
});
