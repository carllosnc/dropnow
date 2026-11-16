import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Env } from './env.js';

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

const { default: app } = await import('./index.js');

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    SIGNALING_ROOM: {
      idFromName: (name: string) => name as unknown as DurableObjectId,
      get: () => ({
        fetch: async () => new Response('stubbed-do', { status: 200 }),
      }),
    } as unknown as Env['SIGNALING_ROOM'],
    ASSETS: {
      fetch: async () => new Response('asset-html', { status: 200 }),
    } as unknown as Fetcher,
    ...overrides,
  };
}

describe('Worker HTTP routes', () => {
  it('GET /api/health returns ok status', async () => {
    const res = await app.request('/api/health', {}, createMockEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });

  it('GET /api/turn-credentials returns STUN fallback when TURN env vars are unset', async () => {
    const res = await app.request('/api/turn-credentials', {}, createMockEnv());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      turnEnabled: boolean;
      iceServers: Array<{ urls: string | string[] }>;
    };
    expect(body.turnEnabled).toBe(false);
    expect(body.iceServers.length).toBeGreaterThan(0);
  });

  it('GET /api/turn-credentials calls Cloudflare TURN API when configured', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          iceServers: {
            urls: ['turn:turn.cloudflare.com:3478?transport=udp'],
            username: 'turn-user',
            credential: 'turn-pass',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as unknown as typeof fetch;

    const env = createMockEnv({
      TURN_KEY_ID: 'key-123',
      TURN_KEY_API_TOKEN: 'secret-token',
    });

    const res = await app.request('/api/turn-credentials', {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      turnEnabled: boolean;
      ttl?: number;
      iceServers: Array<{ username?: string }>;
    };
    expect(body.turnEnabled).toBe(true);
    expect(body.ttl).toBe(86400);
    expect(body.iceServers.some((s) => s.username === 'turn-user')).toBe(true);
  });

  it('GET /ws/:roomId validates roomId and Upgrade header', async () => {
    const invalidRoom = await app.request('/ws/ab', {}, createMockEnv());
    expect(invalidRoom.status).toBe(400);

    const noUpgrade = await app.request('/ws/room-123', {}, createMockEnv());
    expect(noUpgrade.status).toBe(426);

    const validUpgrade = await app.request(
      '/ws/room-123',
      { headers: { Upgrade: 'websocket' } },
      createMockEnv(),
    );
    expect(validUpgrade.status).toBe(200);
    expect(await validUpgrade.text()).toBe('stubbed-do');
  });

  it('forwards non-API/WS requests to ASSETS binding', async () => {
    const res = await app.request('/index.html', {}, createMockEnv());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('asset-html');
  });
});
