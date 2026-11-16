import { Hono } from 'hono';
import { z } from 'zod';
import {
  IceServerSchema,
  RoomIdSchema,
  type TurnCredentialsResponse,
} from '@dropnow/shared';
import type { Env } from './env.js';

export { SignalingRoom } from './signaling-room.js';

const CloudflareTurnApiResponseSchema = z.object({
  iceServers: z.union([IceServerSchema, z.array(IceServerSchema)]),
});

const DEFAULT_STUN_SERVERS = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
];

const TURN_TTL_SECONDS = 86400;

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/turn-credentials', async (c) => {
  const { TURN_KEY_ID, TURN_KEY_API_TOKEN } = c.env;

  if (!TURN_KEY_ID || !TURN_KEY_API_TOKEN) {
    const fallback: TurnCredentialsResponse = {
      iceServers: DEFAULT_STUN_SERVERS,
      turnEnabled: false,
    };
    return c.json(fallback);
  }

  const endpoint = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(
    TURN_KEY_ID,
  )}/credentials/generate-ice-servers`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TURN_KEY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cloudflare TURN API error:', response.status, errorText);
      return c.json(
        { error: 'Failed to generate TURN credentials' },
        { status: 502 },
      );
    }

    const rawData: unknown = await response.json();
    const parsed = CloudflareTurnApiResponseSchema.safeParse(rawData);

    if (!parsed.success) {
      console.error('Unexpected TURN API response shape:', parsed.error);
      return c.json(
        { error: 'Invalid TURN credentials response' },
        { status: 502 },
      );
    }

    const normalizedIceServers = Array.isArray(parsed.data.iceServers)
      ? parsed.data.iceServers
      : [parsed.data.iceServers];

    const payload: TurnCredentialsResponse = {
      iceServers: [...DEFAULT_STUN_SERVERS, ...normalizedIceServers],
      turnEnabled: true,
      ttl: TURN_TTL_SECONDS,
    };

    return c.json(payload, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('TURN credentials fetch failed:', err);
    return c.json(
      { error: 'TURN service unavailable' },
      { status: 502 },
    );
  }
});

app.get('/ws/:roomId', async (c) => {
  const roomIdParam = c.req.param('roomId');
  const parsedRoomId = RoomIdSchema.safeParse(roomIdParam);

  if (!parsedRoomId.success) {
    return c.json(
      { error: 'Invalid room ID. Use 3-64 alphanumeric, dash, or underscore characters.' },
      { status: 400 },
    );
  }

  const upgradeHeader = c.req.header('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }

  const id = c.env.SIGNALING_ROOM.idFromName(parsedRoomId.data);
  const stub = c.env.SIGNALING_ROOM.get(id);
  return stub.fetch(c.req.raw);
});

app.all('*', (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
