import { useCallback, useEffect, useRef, useState } from 'react';
import { Zip, ZipPassThrough } from 'fflate';
import {
  DataChannelControlMessageSchema,
  ServerSignalingMessageSchema,
  TurnCredentialsResponseSchema,
  type ClientSignalingMessage,
  type DataChannelControlMessage,
  type IceServerConfig,
  type PeerInfo,
  type SharedFileInfo,
} from '@dropnow/shared';
import { decodeChunkFrame, encodeChunkFrame } from '../lib/chunkFrame.js';

const CHUNK_SIZE = 64 * 1024; // 64 KB
const HIGH_WATER_MARK = 1024 * 1024; // 1 MB backpressure pause threshold
const LOW_WATER_MARK = 256 * 1024; // 256 KB resume threshold

interface FileSystemWritableStreamLike {
  write(data: BufferSource | Blob | string): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

interface FileSystemFileHandleLike {
  createWritable(): Promise<FileSystemWritableStreamLike>;
}

type ShowSaveFilePickerFn = (options?: {
  suggestedName?: string;
}) => Promise<FileSystemFileHandleLike>;

export type PeerConnectionStatus =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed';

export interface PeerState extends PeerInfo {
  connectionState: PeerConnectionStatus;
  dataChannelOpen: boolean;
  sharedFiles: SharedFileInfo[];
}

export interface LocalSharedFile extends SharedFileInfo {
  file: File;
}

export type TransferDirection = 'outgoing' | 'incoming';

export type TransferStatus =
  | 'transferring'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface TransferItem {
  transferId: string;
  fileId: string;
  peerId: string;
  peerName: string;
  direction: TransferDirection;
  purpose?: 'download' | 'preview' | 'zip';
  name: string;
  size: number;
  mimeType: string;
  bytesTransferred: number;
  speedBps: number;
  status: TransferStatus;
  error?: string;
  startedAt: number;
}

interface PeerRuntime {
  info: PeerInfo;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  pendingIceCandidates: RTCIceCandidateInit[];
  sharedFiles: SharedFileInfo[];
}

interface OutgoingTransferRuntime {
  transferId: string;
  fileId: string;
  targetPeerId: string;
  file: File;
  cancelled: boolean;
}

interface IncomingTransferRuntime {
  transferId: string;
  fromPeerId: string;
  fileInfo: SharedFileInfo;
  bytesReceived: number;
  startedAt: number;
  lastTickAt: number;
  lastTickBytes: number;
  writable: FileSystemWritableStreamLike | null;
  writeQueue: Promise<void>;
  chunks: Uint8Array[];
  cancelled: boolean;
  onChunk?: (chunk: Uint8Array) => void;
  onComplete?: () => void;
  onAbort?: (reason?: string) => void;
}

function makeUniqueZipName(name: string, used: Set<string>): string {
  const sanitized = name.replace(/[/\\]/g, '_') || 'file';
  if (!used.has(sanitized)) {
    used.add(sanitized);
    return sanitized;
  }
  const dotIdx = sanitized.lastIndexOf('.');
  const stem = dotIdx > 0 ? sanitized.slice(0, dotIdx) : sanitized;
  const ext = dotIdx > 0 ? sanitized.slice(dotIdx) : '';
  let counter = 2;
  while (used.has(`${stem} (${counter})${ext}`)) {
    counter += 1;
  }
  const unique = `${stem} (${counter})${ext}`;
  used.add(unique);
  return unique;
}

function waitForBufferedAmountLow(
  channel: RTCDataChannel,
  isCancelled: () => boolean,
): Promise<void> {
  if (channel.bufferedAmount <= HIGH_WATER_MARK) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      channel.removeEventListener('bufferedamountlow', onLow);
      channel.removeEventListener('close', onClose);
      channel.removeEventListener('error', onError);
    };

    const onLow = () => {
      cleanup();
      if (isCancelled()) {
        reject(new Error('Transfer cancelled'));
      } else {
        resolve();
      }
    };

    const onClose = () => {
      cleanup();
      reject(new Error('DataChannel closed during transfer'));
    };

    const onError = () => {
      cleanup();
      reject(new Error('DataChannel error during transfer'));
    };

    channel.addEventListener('bufferedamountlow', onLow);
    channel.addEventListener('close', onClose);
    channel.addEventListener('error', onError);

    if (channel.bufferedAmount <= LOW_WATER_MARK) {
      cleanup();
      resolve();
    }
  });
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

function toSharedFileInfo(entry: LocalSharedFile): SharedFileInfo {
  return {
    fileId: entry.fileId,
    name: entry.name,
    size: entry.size,
    mimeType: entry.mimeType,
    sharedAt: entry.sharedAt,
  };
}

export interface UseWebRTCOptions {
  roomPassword?: string;
  onPeerJoined?: (peer: { peerId: string; displayName: string }) => void;
  onPeerFilesAdded?: (peer: {
    peerId: string;
    displayName: string;
    files: SharedFileInfo[];
  }) => void;
  onJoinError?: (code: string, message: string) => void;
  onRoomClosed?: (reason: string) => void;
}

export function useWebRTC(
  roomId: string | null,
  displayName: string,
  localPeerId: string,
  options?: UseWebRTCOptions,
) {
  const [wsStatus, setWsStatus] = useState<
    'connecting' | 'connected' | 'disconnected' | 'error'
  >(roomId ? 'connecting' : 'disconnected');
  const [turnEnabled, setTurnEnabled] = useState<boolean | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [peers, setPeers] = useState<PeerState[]>([]);
  const [sharedFiles, setSharedFiles] = useState<LocalSharedFile[]>([]);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [isZipping, setIsZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const lastSentDisplayNameRef = useRef(displayName.trim() || 'Anonymous Peer');
  const roomPasswordRef = useRef(options?.roomPassword);
  roomPasswordRef.current = options?.roomPassword;
  const onPeerJoinedRef = useRef(options?.onPeerJoined);
  onPeerJoinedRef.current = options?.onPeerJoined;
  const onPeerFilesAddedRef = useRef(options?.onPeerFilesAdded);
  onPeerFilesAddedRef.current = options?.onPeerFilesAdded;
  const onJoinErrorRef = useRef(options?.onJoinError);
  onJoinErrorRef.current = options?.onJoinError;
  const onRoomClosedRef = useRef(options?.onRoomClosed);
  onRoomClosedRef.current = options?.onRoomClosed;

  const wsRef = useRef<WebSocket | null>(null);
  const iceServersRef = useRef<IceServerConfig[]>([
    { urls: 'stun:stun.cloudflare.com:3478' },
  ]);
  const peersRef = useRef<Map<string, PeerRuntime>>(new Map());
  const sharedFilesRef = useRef<LocalSharedFile[]>([]);
  const outgoingRef = useRef<Map<string, OutgoingTransferRuntime>>(new Map());
  const incomingRef = useRef<Map<string, IncomingTransferRuntime>>(new Map());
  const previewCacheRef = useRef<Map<string, Blob>>(new Map());

  const syncPeersState = useCallback(() => {
    const next: PeerState[] = [];
    for (const runtime of peersRef.current.values()) {
      const pcState = runtime.pc.connectionState;
      let mapped: PeerConnectionStatus = 'new';
      if (pcState === 'connected') mapped = 'connected';
      else if (pcState === 'connecting') mapped = 'connecting';
      else if (pcState === 'failed') mapped = 'failed';
      else if (pcState === 'disconnected' || pcState === 'closed') {
        mapped = 'disconnected';
      }

      next.push({
        peerId: runtime.info.peerId,
        displayName: runtime.info.displayName,
        connectionState: mapped,
        dataChannelOpen: runtime.dc?.readyState === 'open',
        sharedFiles: runtime.sharedFiles,
      });
    }
    setPeers(next);
  }, []);

  const updateTransfer = useCallback(
    (transferId: string, patch: Partial<TransferItem>) => {
      setTransfers((prev) =>
        prev.map((item) =>
          item.transferId === transferId ? { ...item, ...patch } : item,
        ),
      );
    },
    [],
  );

  const removeTransfer = useCallback((transferId: string) => {
    setTransfers((prev) =>
      prev.filter((item) => item.transferId !== transferId),
    );
  }, []);

  const sendSignaling = useCallback((message: ClientSignalingMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, []);

  const sendControl = useCallback(
    (peerId: string, message: DataChannelControlMessage) => {
      const runtime = peersRef.current.get(peerId);
      if (runtime?.dc && runtime.dc.readyState === 'open') {
        runtime.dc.send(JSON.stringify(message));
        return true;
      }
      return false;
    },
    [],
  );

  const broadcastCatalog = useCallback(
    (files: LocalSharedFile[]) => {
      const catalog: DataChannelControlMessage = {
        type: 'file-catalog',
        files: files.map(toSharedFileInfo),
      };
      const encoded = JSON.stringify(catalog);
      for (const runtime of peersRef.current.values()) {
        if (runtime.dc && runtime.dc.readyState === 'open') {
          runtime.dc.send(encoded);
        }
      }
    },
    [],
  );

  const addSharedFiles = useCallback(
    (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList);
      if (incoming.length === 0) return;

      const now = Date.now();
      const added: LocalSharedFile[] = incoming.map((file, idx) => ({
        fileId: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        sharedAt: now + idx,
      }));

      const next = [...sharedFilesRef.current, ...added];
      sharedFilesRef.current = next;
      setSharedFiles(next);
      broadcastCatalog(next);
    },
    [broadcastCatalog],
  );

  const removeSharedFile = useCallback(
    (fileId: string) => {
      for (const [transferId, outgoing] of outgoingRef.current.entries()) {
        if (outgoing.fileId !== fileId) continue;
        outgoing.cancelled = true;
        outgoingRef.current.delete(transferId);
        sendControl(outgoing.targetPeerId, {
          type: 'file-cancel',
          transferId,
        });
        updateTransfer(transferId, { status: 'cancelled', speedBps: 0 });
      }

      const next = sharedFilesRef.current.filter((f) => f.fileId !== fileId);
      sharedFilesRef.current = next;
      setSharedFiles(next);
      broadcastCatalog(next);
    },
    [broadcastCatalog, sendControl, updateTransfer],
  );

  const startOutgoingStream = useCallback(
    async (runtime: OutgoingTransferRuntime) => {
      const peer = peersRef.current.get(runtime.targetPeerId);
      const channel = peer?.dc;
      if (!channel || channel.readyState !== 'open') {
        updateTransfer(runtime.transferId, {
          status: 'error',
          error: 'DataChannel is not open',
        });
        outgoingRef.current.delete(runtime.transferId);
        return;
      }

      const startedAt = Date.now();
      let lastTickAt = startedAt;
      let lastTickBytes = 0;

      try {
        let offset = 0;
        while (offset < runtime.file.size) {
          if (runtime.cancelled) {
            throw new Error('Transfer cancelled');
          }

          if (channel.bufferedAmount > HIGH_WATER_MARK) {
            await waitForBufferedAmountLow(channel, () => runtime.cancelled);
          }

          if (channel.readyState !== 'open') {
            throw new Error('DataChannel closed');
          }

          const end = Math.min(offset + CHUNK_SIZE, runtime.file.size);
          const sliceBuffer = await runtime.file.slice(offset, end).arrayBuffer();
          const frame = encodeChunkFrame(runtime.transferId, sliceBuffer);
          channel.send(frame);

          offset = end;

          const now = Date.now();
          const elapsedMs = now - lastTickAt;
          if (elapsedMs >= 200 || offset === runtime.file.size) {
            const deltaBytes = offset - lastTickBytes;
            const speedBps =
              elapsedMs > 0 ? (deltaBytes / elapsedMs) * 1000 : 0;
            lastTickAt = now;
            lastTickBytes = offset;

            updateTransfer(runtime.transferId, {
              bytesTransferred: offset,
              speedBps,
            });
          }
        }

        sendControl(runtime.targetPeerId, {
          type: 'file-complete',
          transferId: runtime.transferId,
        });

        updateTransfer(runtime.transferId, {
          bytesTransferred: runtime.file.size,
          speedBps: 0,
          status: 'completed',
        });
      } catch (err) {
        if (!runtime.cancelled) {
          const reason = err instanceof Error ? err.message : 'Stream failed';
          sendControl(runtime.targetPeerId, {
            type: 'transfer-error',
            transferId: runtime.transferId,
            reason,
          });
          updateTransfer(runtime.transferId, {
            status: 'error',
            error: reason,
            speedBps: 0,
          });
        }
      } finally {
        outgoingRef.current.delete(runtime.transferId);
      }
    },
    [sendControl, updateTransfer],
  );

  const handleControlMessage = useCallback(
    (fromPeerId: string, msg: DataChannelControlMessage) => {
      const peer = peersRef.current.get(fromPeerId);
      const peerName = peer?.info.displayName ?? fromPeerId;

      switch (msg.type) {
        case 'file-catalog': {
          if (peer) {
            const prevIds = new Set(peer.sharedFiles.map((f) => f.fileId));
            const nextIds = new Set(msg.files.map((f) => f.fileId));
            for (const prevId of prevIds) {
              if (!nextIds.has(prevId)) {
                previewCacheRef.current.delete(`${fromPeerId}:${prevId}`);
              }
            }
            const addedFiles = msg.files.filter((f) => !prevIds.has(f.fileId));
            peer.sharedFiles = msg.files;
            syncPeersState();
            if (addedFiles.length > 0) {
              onPeerFilesAddedRef.current?.({
                peerId: fromPeerId,
                displayName: peer.info.displayName,
                files: addedFiles,
              });
            }
          }
          break;
        }
        case 'file-request': {
          const entry = sharedFilesRef.current.find(
            (f) => f.fileId === msg.fileId,
          );
          if (!entry) {
            sendControl(fromPeerId, {
              type: 'transfer-error',
              transferId: msg.transferId,
              reason: 'File is no longer shared by sender',
            });
            break;
          }

          const runtime: OutgoingTransferRuntime = {
            transferId: msg.transferId,
            fileId: entry.fileId,
            targetPeerId: fromPeerId,
            file: entry.file,
            cancelled: false,
          };
          outgoingRef.current.set(msg.transferId, runtime);

          setTransfers((prev) => [
            {
              transferId: msg.transferId,
              fileId: entry.fileId,
              peerId: fromPeerId,
              peerName,
              direction: 'outgoing',
              name: entry.name,
              size: entry.size,
              mimeType: entry.mimeType,
              bytesTransferred: 0,
              speedBps: 0,
              status: 'transferring',
              startedAt: Date.now(),
            },
            ...prev,
          ]);

          void startOutgoingStream(runtime);
          break;
        }
        case 'file-cancel': {
          const outgoing = outgoingRef.current.get(msg.transferId);
          if (outgoing && outgoing.targetPeerId === fromPeerId) {
            outgoing.cancelled = true;
            outgoingRef.current.delete(msg.transferId);
            updateTransfer(msg.transferId, { status: 'cancelled', speedBps: 0 });
          }
          const incoming = incomingRef.current.get(msg.transferId);
          if (incoming && incoming.fromPeerId === fromPeerId) {
            incoming.cancelled = true;
            incomingRef.current.delete(msg.transferId);
            void incoming.writable?.abort().catch(() => {});
            incoming.onAbort?.('Transfer cancelled by peer');
            updateTransfer(msg.transferId, { status: 'cancelled', speedBps: 0 });
          }
          break;
        }
        case 'file-complete': {
          const incoming = incomingRef.current.get(msg.transferId);
          if (!incoming || incoming.fromPeerId !== fromPeerId) break;
          incomingRef.current.delete(msg.transferId);

          void (async () => {
            try {
              if (incoming.onComplete) {
                incoming.onComplete();
              } else if (incoming.writable) {
                await incoming.writeQueue;
                if (incoming.cancelled) return;
                await incoming.writable.close();
              } else {
                const blobParts = incoming.chunks.map(
                  (c) =>
                    c.buffer.slice(
                      c.byteOffset,
                      c.byteOffset + c.byteLength,
                    ) as ArrayBuffer,
                );
                const blob = new Blob(blobParts, {
                  type: incoming.fileInfo.mimeType || 'application/octet-stream',
                });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = incoming.fileInfo.name;
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                setTimeout(() => URL.revokeObjectURL(url), 10_000);
              }
              updateTransfer(msg.transferId, {
                bytesTransferred: incoming.fileInfo.size,
                speedBps: 0,
                status: 'completed',
              });
            } catch (err) {
              updateTransfer(msg.transferId, {
                status: 'error',
                error:
                  err instanceof Error ? err.message : 'Failed to finalize file',
                speedBps: 0,
              });
            }
          })();
          break;
        }
        case 'transfer-error': {
          let matched = false;
          const outgoing = outgoingRef.current.get(msg.transferId);
          if (outgoing && outgoing.targetPeerId === fromPeerId) {
            outgoing.cancelled = true;
            outgoingRef.current.delete(msg.transferId);
            matched = true;
          }
          const incoming = incomingRef.current.get(msg.transferId);
          if (incoming && incoming.fromPeerId === fromPeerId) {
            incoming.cancelled = true;
            incomingRef.current.delete(msg.transferId);
            void incoming.writable?.abort().catch(() => {});
            incoming.onAbort?.(msg.reason);
            matched = true;
          }
          if (matched) {
            updateTransfer(msg.transferId, {
              status: 'error',
              error: msg.reason,
              speedBps: 0,
            });
          }
          break;
        }
      }
    },
    [sendControl, startOutgoingStream, syncPeersState, updateTransfer],
  );

  const handleBinaryChunk = useCallback(
    (frame: ArrayBuffer) => {
      const decoded = decodeChunkFrame(frame);
      if (!decoded) return;

      const incoming = incomingRef.current.get(decoded.transferId);
      if (!incoming || incoming.cancelled) return;

      const { payload } = decoded;
      incoming.bytesReceived += payload.byteLength;

      if (incoming.onChunk) {
        const copy = new Uint8Array(payload.byteLength);
        copy.set(payload);
        incoming.onChunk(copy);
      } else if (incoming.writable) {
        const writable = incoming.writable;
        const copy = new Uint8Array(payload.byteLength);
        copy.set(payload);
        // Serialize disk writes so chunks cannot race or outrun file-complete
        incoming.writeQueue = incoming.writeQueue
          .then(() => {
            if (incoming.cancelled) return;
            return writable.write(copy);
          })
          .catch((err) => {
            if (incoming.cancelled) return;
            incoming.cancelled = true;
            incomingRef.current.delete(incoming.transferId);
            void writable.abort().catch(() => {});
            updateTransfer(incoming.transferId, {
              status: 'error',
              error: err instanceof Error ? err.message : 'Disk write error',
              speedBps: 0,
            });
          });
      } else {
        const copy = new Uint8Array(payload.byteLength);
        copy.set(payload);
        incoming.chunks.push(copy);
      }

      const now = Date.now();
      const elapsedMs = now - incoming.lastTickAt;
      if (elapsedMs >= 200 || incoming.bytesReceived >= incoming.fileInfo.size) {
        const deltaBytes = incoming.bytesReceived - incoming.lastTickBytes;
        const speedBps = elapsedMs > 0 ? (deltaBytes / elapsedMs) * 1000 : 0;
        incoming.lastTickAt = now;
        incoming.lastTickBytes = incoming.bytesReceived;

        updateTransfer(incoming.transferId, {
          bytesTransferred: incoming.bytesReceived,
          speedBps,
        });
      }
    },
    [updateTransfer],
  );

  const attachDataChannel = useCallback(
    (peerId: string, channel: RTCDataChannel) => {
      const runtime = peersRef.current.get(peerId);
      if (!runtime) return;

      channel.binaryType = 'arraybuffer';
      channel.bufferedAmountLowThreshold = LOW_WATER_MARK;
      runtime.dc = channel;

      channel.onopen = () => {
        syncPeersState();
        // Immediately sync our currently shared file list to the newly connected peer
        const catalog: DataChannelControlMessage = {
          type: 'file-catalog',
          files: sharedFilesRef.current.map(toSharedFileInfo),
        };
        channel.send(JSON.stringify(catalog));
      };

      channel.onclose = () => {
        syncPeersState();
      };

      channel.onerror = () => {
        syncPeersState();
      };

      channel.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const raw: unknown = JSON.parse(event.data);
            const parsed = DataChannelControlMessageSchema.safeParse(raw);
            if (parsed.success) {
              handleControlMessage(peerId, parsed.data);
            }
          } catch {
            // Ignore malformed control payload
          }
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          handleBinaryChunk(event.data);
        } else if (event.data instanceof Blob) {
          void event.data.arrayBuffer().then(handleBinaryChunk);
        }
      };

      syncPeersState();
    },
    [handleBinaryChunk, handleControlMessage, syncPeersState],
  );

  const createPeerRuntime = useCallback(
    (peerInfo: PeerInfo, isInitiator: boolean): PeerRuntime => {
      const existing = peersRef.current.get(peerInfo.peerId);
      if (existing) {
        existing.pc.close();
        peersRef.current.delete(peerInfo.peerId);
      }

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current as RTCIceServer[],
      });

      const runtime: PeerRuntime = {
        info: peerInfo,
        pc,
        dc: null,
        pendingIceCandidates: [],
        sharedFiles: [],
      };

      peersRef.current.set(peerInfo.peerId, runtime);

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        sendSignaling({
          type: 'ice-candidate',
          targetPeerId: peerInfo.peerId,
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            usernameFragment: event.candidate.usernameFragment,
          },
        });
      };

      pc.onconnectionstatechange = () => {
        syncPeersState();
      };

      pc.ondatachannel = (event) => {
        attachDataChannel(peerInfo.peerId, event.channel);
      };

      if (isInitiator) {
        const channel = pc.createDataChannel('dropnow-file-transfer', {
          ordered: true,
        });
        attachDataChannel(peerInfo.peerId, channel);

        void (async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (pc.localDescription?.sdp) {
              sendSignaling({
                type: 'offer',
                targetPeerId: peerInfo.peerId,
                sdp: {
                  type: 'offer',
                  sdp: pc.localDescription.sdp,
                },
              });
            }
          } catch (err) {
            console.error('Failed to create offer:', err);
          }
        })();
      }

      syncPeersState();
      return runtime;
    },
    [attachDataChannel, sendSignaling, syncPeersState],
  );

  const abortActiveTransfers = useCallback(
    (peerId?: string, errorReason?: string) => {
      for (const [transferId, outgoing] of outgoingRef.current.entries()) {
        if (peerId && outgoing.targetPeerId !== peerId) continue;
        outgoing.cancelled = true;
        outgoingRef.current.delete(transferId);
        if (errorReason) {
          updateTransfer(transferId, {
            status: 'error',
            error: errorReason,
            speedBps: 0,
          });
        }
      }

      for (const [transferId, incoming] of incomingRef.current.entries()) {
        if (peerId && incoming.fromPeerId !== peerId) continue;
        incoming.cancelled = true;
        incomingRef.current.delete(transferId);
        void incoming.writable?.abort().catch(() => {});
        incoming.onAbort?.(errorReason);
        if (errorReason) {
          updateTransfer(transferId, {
            status: 'error',
            error: errorReason,
            speedBps: 0,
          });
        }
      }
    },
    [updateTransfer],
  );

  const removePeerRuntime = useCallback(
    (peerId: string) => {
      abortActiveTransfers(peerId, 'Peer disconnected');
      for (const key of previewCacheRef.current.keys()) {
        if (key.startsWith(`${peerId}:`)) {
          previewCacheRef.current.delete(key);
        }
      }
      const runtime = peersRef.current.get(peerId);
      if (runtime) {
        runtime.dc?.close();
        runtime.pc.close();
        peersRef.current.delete(peerId);
        syncPeersState();
      }
    },
    [abortActiveTransfers, syncPeersState],
  );

  useEffect(() => {
    if (!roomId) {
      setWsStatus('disconnected');
      setIsHost(false);
      setError(null);
      setPeers([]);
      sharedFilesRef.current = [];
      previewCacheRef.current.clear();
      setSharedFiles([]);
      setTransfers([]);
      return;
    }

    let disposed = false;
    let closedByServer = false;
    let reconnectAttempt = 0;
    let reconnectTimer: number | null = null;
    let turnFetched = false;

    const connect = async () => {
      if (disposed || closedByServer) return;
      setWsStatus('connecting');
      setError(null);

      if (!turnFetched) {
        turnFetched = true;
        try {
          const res = await fetch('/api/turn-credentials');
          if (res.ok) {
            const raw: unknown = await res.json();
            const parsed = TurnCredentialsResponseSchema.safeParse(raw);
            if (parsed.success && !disposed) {
              iceServersRef.current = parsed.data.iceServers;
              setTurnEnabled(parsed.data.turnEnabled);
            }
          }
        } catch {
          if (!disposed) setTurnEnabled(false);
        }
      }

      if (disposed || closedByServer) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/${encodeURIComponent(roomId)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        reconnectAttempt = 0;
        setWsStatus('connected');
        const password = roomPasswordRef.current;
        const joinedName = displayNameRef.current.trim() || 'Anonymous Peer';
        lastSentDisplayNameRef.current = joinedName;
        sendSignaling({
          type: 'join',
          roomId,
          peerId: localPeerId,
          displayName: joinedName,
          ...(password ? { password } : {}),
        });
      };

      ws.onerror = () => {
        if (!disposed) {
          setWsStatus('error');
          setError('WebSocket signaling connection failed.');
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setWsStatus('disconnected');
        if (closedByServer) return;
        const delayMs = Math.min(1000 * 2 ** reconnectAttempt, 10_000);
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          void connect();
        }, delayMs);
      };

      ws.onmessage = async (event) => {
        if (typeof event.data !== 'string') return;

        let raw: unknown;
        try {
          raw = JSON.parse(event.data);
        } catch {
          return;
        }

        const parsed = ServerSignalingMessageSchema.safeParse(raw);
        if (!parsed.success) return;

        const msg = parsed.data;
        switch (msg.type) {
          case 'room-peers': {
            setIsHost(Boolean(msg.isHost));
            for (const peer of msg.peers) {
              const isInitiator = localPeerId.localeCompare(peer.peerId) < 0;
              createPeerRuntime(peer, isInitiator);
            }
            break;
          }
          case 'peer-joined': {
            const existing = peersRef.current.get(msg.peer.peerId);
            if (existing) {
              existing.info = {
                ...existing.info,
                displayName: msg.peer.displayName,
              };
              syncPeersState();
            } else {
              const isInitiator = localPeerId.localeCompare(msg.peer.peerId) < 0;
              createPeerRuntime(msg.peer, isInitiator);
            }
            onPeerJoinedRef.current?.(msg.peer);
            break;
          }
          case 'peer-left': {
            removePeerRuntime(msg.peerId);
            break;
          }
          case 'peer-updated': {
            const runtime = peersRef.current.get(msg.peer.peerId);
            if (runtime) {
              runtime.info = {
                ...runtime.info,
                displayName: msg.peer.displayName,
              };
              syncPeersState();
            }
            setTransfers((prev) =>
              prev.map((t) =>
                t.peerId === msg.peer.peerId
                  ? { ...t, peerName: msg.peer.displayName }
                  : t,
              ),
            );
            break;
          }
          case 'offer': {
            let runtime = peersRef.current.get(msg.fromPeerId);
            if (!runtime) {
              runtime = createPeerRuntime(
                { peerId: msg.fromPeerId, displayName: msg.fromPeerId },
                false,
              );
            }

            try {
              await runtime.pc.setRemoteDescription(msg.sdp);
              for (const candidate of runtime.pendingIceCandidates) {
                await runtime.pc.addIceCandidate(candidate);
              }
              runtime.pendingIceCandidates = [];

              const answer = await runtime.pc.createAnswer();
              await runtime.pc.setLocalDescription(answer);
              if (runtime.pc.localDescription?.sdp) {
                sendSignaling({
                  type: 'answer',
                  targetPeerId: msg.fromPeerId,
                  sdp: {
                    type: 'answer',
                    sdp: runtime.pc.localDescription.sdp,
                  },
                });
              }
            } catch (err) {
              console.error('Error handling offer:', err);
            }
            break;
          }
          case 'answer': {
            const runtime = peersRef.current.get(msg.fromPeerId);
            if (!runtime) break;
            try {
              await runtime.pc.setRemoteDescription(msg.sdp);
              for (const candidate of runtime.pendingIceCandidates) {
                await runtime.pc.addIceCandidate(candidate);
              }
              runtime.pendingIceCandidates = [];
            } catch (err) {
              console.error('Error handling answer:', err);
            }
            break;
          }
          case 'ice-candidate': {
            const runtime = peersRef.current.get(msg.fromPeerId);
            if (!runtime) break;
            try {
              if (runtime.pc.remoteDescription) {
                await runtime.pc.addIceCandidate(msg.candidate);
              } else {
                runtime.pendingIceCandidates.push(msg.candidate);
              }
            } catch (err) {
              console.error('Error adding ICE candidate:', err);
            }
            break;
          }
          case 'room-closed': {
            closedByServer = true;
            abortActiveTransfers();
            for (const runtime of peersRef.current.values()) {
              runtime.dc?.close();
              runtime.pc.close();
            }
            peersRef.current.clear();
            setPeers([]);
            setIsHost(false);
            wsRef.current?.close();
            wsRef.current = null;
            onRoomClosedRef.current?.(msg.reason);
            break;
          }
          case 'error': {
            if (
              msg.code === 'PASSWORD_REQUIRED' ||
              msg.code === 'INVALID_PASSWORD'
            ) {
              closedByServer = true;
              onJoinErrorRef.current?.(msg.code, msg.message);
            } else {
              setError(`${msg.code}: ${msg.message}`);
            }
            break;
          }
        }
      };
    };

    void connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      setIsHost(false);
      abortActiveTransfers();
      wsRef.current?.close();
      wsRef.current = null;
      for (const runtime of peersRef.current.values()) {
        runtime.dc?.close();
        runtime.pc.close();
      }
      peersRef.current.clear();
      sharedFilesRef.current = [];
      previewCacheRef.current.clear();
      setPeers([]);
      setSharedFiles([]);
      setTransfers([]);
    };
  }, [
    abortActiveTransfers,
    createPeerRuntime,
    localPeerId,
    removePeerRuntime,
    roomId,
    sendSignaling,
    syncPeersState,
  ]);

  useEffect(() => {
    if (!roomId || wsStatus !== 'connected') return;
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === lastSentDisplayNameRef.current) return;

    const timer = window.setTimeout(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      lastSentDisplayNameRef.current = trimmed;
      sendSignaling({
        type: 'update-name',
        displayName: trimmed,
      });
    }, 200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [displayName, roomId, sendSignaling, wsStatus]);

  const downloadFile = useCallback(
    async (peerId: string, fileInfo: SharedFileInfo, useFilePicker = true) => {
      const peer = peersRef.current.get(peerId);
      if (!peer?.dc || peer.dc.readyState !== 'open') {
        setError('Peer DataChannel is not connected yet.');
        return;
      }

      let writable: FileSystemWritableStreamLike | null = null;
      if (useFilePicker && supportsFileSystemAccess()) {
        try {
          const picker = (
            window as unknown as { showSaveFilePicker: ShowSaveFilePickerFn }
          ).showSaveFilePicker;
          const handle = await picker({
            suggestedName: fileInfo.name,
          });
          writable = await handle.createWritable();
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          writable = null;
        }
      }

      const transferId = crypto.randomUUID();
      const now = Date.now();

      incomingRef.current.set(transferId, {
        transferId,
        fromPeerId: peerId,
        fileInfo,
        bytesReceived: 0,
        startedAt: now,
        lastTickAt: now,
        lastTickBytes: 0,
        writable,
        writeQueue: Promise.resolve(),
        chunks: [],
        cancelled: false,
      });

      setTransfers((prev) => [
        {
          transferId,
          fileId: fileInfo.fileId,
          peerId,
          peerName: peer.info.displayName,
          direction: 'incoming',
          name: fileInfo.name,
          size: fileInfo.size,
          mimeType: fileInfo.mimeType,
          bytesTransferred: 0,
          speedBps: 0,
          status: 'transferring',
          startedAt: now,
        },
        ...prev,
      ]);

      sendControl(peerId, {
        type: 'file-request',
        transferId,
        fileId: fileInfo.fileId,
      });
    },
    [sendControl],
  );

  const cancelTransfer = useCallback(
    (transferId: string) => {
      const outgoing = outgoingRef.current.get(transferId);
      if (outgoing) {
        outgoing.cancelled = true;
        outgoingRef.current.delete(transferId);
        sendControl(outgoing.targetPeerId, {
          type: 'file-cancel',
          transferId,
        });
      }

      const incoming = incomingRef.current.get(transferId);
      if (incoming) {
        incoming.cancelled = true;
        incomingRef.current.delete(transferId);
        void incoming.writable?.abort().catch(() => {});
        incoming.onAbort?.('Transfer cancelled');
        sendControl(incoming.fromPeerId, {
          type: 'file-cancel',
          transferId,
        });
      }

      updateTransfer(transferId, { status: 'cancelled', speedBps: 0 });
    },
    [sendControl, updateTransfer],
  );

  const downloadFilesAsZip = useCallback(
    async (
      items: Array<{ peerId: string; fileInfo: SharedFileInfo }>,
      zipFilename = `dropnow-${roomId ?? 'files'}.zip`,
    ) => {
      const readyItems = items.filter((item) => {
        const peer = peersRef.current.get(item.peerId);
        return peer?.dc?.readyState === 'open';
      });
      if (readyItems.length === 0) return;

      let zipWritable: FileSystemWritableStreamLike | null = null;
      if (supportsFileSystemAccess()) {
        try {
          const picker = (
            window as unknown as { showSaveFilePicker: ShowSaveFilePickerFn }
          ).showSaveFilePicker;
          const handle = await picker({ suggestedName: zipFilename });
          zipWritable = await handle.createWritable();
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          zipWritable = null;
        }
      }

      setIsZipping(true);
      const zipChunks: Uint8Array[] = [];
      let writeQueue = Promise.resolve();
      let writeError: unknown = null;
      let resolveDone!: () => void;
      let rejectDone!: (reason: unknown) => void;
      const zipDone = new Promise<void>((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
      });

      const zip = new Zip((err, data, final) => {
        if (err) {
          rejectDone(err);
          return;
        }
        if (zipWritable) {
          const copy = new Uint8Array(data.byteLength);
          copy.set(data);
          writeQueue = writeQueue
            .then(() => {
              if (writeError) return;
              return zipWritable!.write(copy);
            })
            .catch((writeErr) => {
              if (!writeError) {
                writeError = writeErr;
              }
            });
        } else {
          const copy = new Uint8Array(data.byteLength);
          copy.set(data);
          zipChunks.push(copy);
        }
        if (final) {
          resolveDone();
        }
      });

      const usedNames = new Set<string>();
      let completedCount = 0;

      try {
        for (const { peerId, fileInfo } of readyItems) {
          if (writeError) {
            throw writeError;
          }
          const peer = peersRef.current.get(peerId);
          if (!peer?.dc || peer.dc.readyState !== 'open') {
            continue;
          }

          const entryName = makeUniqueZipName(fileInfo.name, usedNames);
          const zipEntry = new ZipPassThrough(entryName);
          zip.add(zipEntry);

          await new Promise<void>((resolve, reject) => {
            const transferId = crypto.randomUUID();
            const now = Date.now();

            incomingRef.current.set(transferId, {
              transferId,
              fromPeerId: peerId,
              fileInfo,
              bytesReceived: 0,
              startedAt: now,
              lastTickAt: now,
              lastTickBytes: 0,
              writable: null,
              writeQueue: Promise.resolve(),
              chunks: [],
              cancelled: false,
              onChunk: (chunk) => {
                zipEntry.push(chunk, false);
              },
              onComplete: () => {
                zipEntry.push(new Uint8Array(0), true);
                completedCount += 1;
                resolve();
              },
              onAbort: (reason) => {
                reject(
                  new Error(
                    reason ?? `Failed to transfer "${fileInfo.name}" for ZIP archive.`,
                  ),
                );
              },
            });

            setTransfers((prev) => [
              {
                transferId,
                fileId: fileInfo.fileId,
                peerId,
                peerName: peer.info.displayName,
                direction: 'incoming',
                purpose: 'zip',
                name: fileInfo.name,
                size: fileInfo.size,
                mimeType: fileInfo.mimeType,
                bytesTransferred: 0,
                speedBps: 0,
                status: 'transferring',
                startedAt: now,
              },
              ...prev,
            ]);

            sendControl(peerId, {
              type: 'file-request',
              transferId,
              fileId: fileInfo.fileId,
            });
          });
        }

        if (writeError) {
          throw writeError;
        }

        if (completedCount === 0) {
          await zipWritable?.abort().catch(() => {});
          return;
        }

        zip.end();
        await zipDone;

        if (zipWritable) {
          await writeQueue;
          if (writeError) {
            throw writeError;
          }
          await zipWritable.close();
        } else {
          const blobParts = zipChunks.map(
            (c) =>
              c.buffer.slice(
                c.byteOffset,
                c.byteOffset + c.byteLength,
              ) as ArrayBuffer,
          );
          const blob = new Blob(blobParts, { type: 'application/zip' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = zipFilename;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
        }
      } catch (err) {
        await zipWritable?.abort().catch(() => {});
        setError(
          err instanceof Error ? err.message : 'Failed to create ZIP archive.',
        );
      } finally {
        setIsZipping(false);
      }
    },
    [roomId, sendControl],
  );

  const getLocalFile = useCallback((fileId: string): File | undefined => {
    return sharedFilesRef.current.find((f) => f.fileId === fileId)?.file;
  }, []);

  const fetchFileForPreview = useCallback(
    async (
      peerId: string,
      fileInfo: SharedFileInfo,
      onProgress?: (bytesReceived: number, totalBytes: number) => void,
      signal?: AbortSignal,
    ): Promise<Blob> => {
      if (signal?.aborted) {
        throw new DOMException('Preview aborted', 'AbortError');
      }

      const cacheKey = `${peerId}:${fileInfo.fileId}`;
      const cached = previewCacheRef.current.get(cacheKey);
      if (cached) {
        onProgress?.(fileInfo.size, fileInfo.size);
        return cached;
      }

      const peer = peersRef.current.get(peerId);
      if (!peer?.dc || peer.dc.readyState !== 'open') {
        throw new Error('Peer DataChannel is not connected yet.');
      }

      return new Promise<Blob>((resolve, reject) => {
        const transferId = crypto.randomUUID();
        const now = Date.now();
        const previewChunks: Uint8Array[] = [];
        let received = 0;

        const handleAbortSignal = () => {
          cancelTransfer(transferId);
        };
        signal?.addEventListener('abort', handleAbortSignal, { once: true });

        const cleanupSignal = () => {
          signal?.removeEventListener('abort', handleAbortSignal);
        };

        incomingRef.current.set(transferId, {
          transferId,
          fromPeerId: peerId,
          fileInfo,
          bytesReceived: 0,
          startedAt: now,
          lastTickAt: now,
          lastTickBytes: 0,
          writable: null,
          writeQueue: Promise.resolve(),
          chunks: [],
          cancelled: false,
          onChunk: (chunk) => {
            previewChunks.push(chunk);
            received += chunk.byteLength;
            onProgress?.(received, fileInfo.size);
          },
          onComplete: () => {
            cleanupSignal();
            removeTransfer(transferId);
            const blobParts = previewChunks.map(
              (c) =>
                c.buffer.slice(
                  c.byteOffset,
                  c.byteOffset + c.byteLength,
                ) as ArrayBuffer,
            );
            const blob = new Blob(blobParts, {
              type: fileInfo.mimeType || 'application/octet-stream',
            });
            previewCacheRef.current.set(cacheKey, blob);
            resolve(blob);
          },
          onAbort: (reason) => {
            cleanupSignal();
            removeTransfer(transferId);
            reject(new Error(reason ?? 'Preview transfer cancelled.'));
          },
        });

        setTransfers((prev) => [
          {
            transferId,
            fileId: fileInfo.fileId,
            peerId,
            peerName: peer.info.displayName,
            direction: 'incoming',
            purpose: 'preview',
            name: fileInfo.name,
            size: fileInfo.size,
            mimeType: fileInfo.mimeType,
            bytesTransferred: 0,
            speedBps: 0,
            status: 'transferring',
            startedAt: now,
          },
          ...prev,
        ]);

        sendControl(peerId, {
          type: 'file-request',
          transferId,
          fileId: fileInfo.fileId,
        });
      });
    },
    [cancelTransfer, removeTransfer, sendControl],
  );

  const clearCompletedTransfers = useCallback(() => {
    setTransfers((prev) => prev.filter((t) => t.status === 'transferring'));
  }, []);

  const shutdownRoom = useCallback(() => {
    sendSignaling({ type: 'shutdown-room' });
  }, [sendSignaling]);

  return {
    wsStatus,
    turnEnabled,
    isHost,
    isZipping,
    peers,
    sharedFiles,
    transfers,
    error,
    addSharedFiles,
    removeSharedFile,
    downloadFile,
    downloadFilesAsZip,
    getLocalFile,
    fetchFileForPreview,
    cancelTransfer,
    clearCompletedTransfers,
    shutdownRoom,
  };
}
