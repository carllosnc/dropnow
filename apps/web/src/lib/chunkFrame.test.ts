import { describe, expect, it } from 'bun:test';
import { decodeChunkFrame, encodeChunkFrame } from './chunkFrame.js';

describe('chunkFrame', () => {
  it('encodes and decodes a binary payload with transferId header', () => {
    const payload = new Uint8Array([10, 20, 30, 40, 255]).buffer;
    const frame = encodeChunkFrame('tx-uuid-1234', payload);
    const decoded = decodeChunkFrame(frame);

    expect(decoded).not.toBeNull();
    expect(decoded?.transferId).toBe('tx-uuid-1234');
    expect(Array.from(decoded?.payload ?? [])).toEqual([10, 20, 30, 40, 255]);
  });

  it('handles empty payloads', () => {
    const frame = encodeChunkFrame('tx-empty', new ArrayBuffer(0));
    const decoded = decodeChunkFrame(frame);

    expect(decoded?.transferId).toBe('tx-empty');
    expect(decoded?.payload.byteLength).toBe(0);
  });

  it('returns null for malformed or truncated frames', () => {
    expect(decodeChunkFrame(new ArrayBuffer(0))).toBeNull();
    expect(decodeChunkFrame(new Uint8Array([0, 1, 2]).buffer)).toBeNull();
    expect(decodeChunkFrame(new Uint8Array([10, 65, 66]).buffer)).toBeNull();
  });

  it('throws when transferId is empty or exceeds 255 bytes', () => {
    expect(() => encodeChunkFrame('', new ArrayBuffer(4))).toThrow();
    expect(() =>
      encodeChunkFrame('a'.repeat(256), new ArrayBuffer(4)),
    ).toThrow();
  });
});
