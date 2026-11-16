const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeChunkFrame(
  transferId: string,
  payload: ArrayBuffer,
): ArrayBuffer {
  const idBytes = textEncoder.encode(transferId);
  if (idBytes.length === 0 || idBytes.length > 255) {
    throw new Error('transferId must be between 1 and 255 UTF-8 bytes');
  }
  const frame = new Uint8Array(1 + idBytes.length + payload.byteLength);
  frame[0] = idBytes.length;
  frame.set(idBytes, 1);
  frame.set(new Uint8Array(payload), 1 + idBytes.length);
  return frame.buffer;
}

export function decodeChunkFrame(frame: ArrayBuffer): {
  transferId: string;
  payload: Uint8Array;
} | null {
  if (frame.byteLength < 2) return null;
  const view = new Uint8Array(frame);
  const idLen = view[0];
  if (idLen === undefined || idLen === 0 || frame.byteLength < 1 + idLen) {
    return null;
  }
  const transferId = textDecoder.decode(view.subarray(1, 1 + idLen));
  const payload = view.subarray(1 + idLen);
  return { transferId, payload };
}
