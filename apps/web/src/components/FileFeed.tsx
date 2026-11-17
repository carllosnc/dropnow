import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileArchive,
  FileAudio,
  FileCode,
  FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FolderUp,
  HardDriveDownload,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { SharedFileInfo } from '@dropnow/shared';
import {
  supportsFileSystemAccess,
  type TransferItem,
} from '../hooks/useWebRTC.js';
import { formatBytes, formatSpeed } from '../lib/format.js';
import { Avatar } from './Avatar.js';

export interface FeedEntry {
  kind: 'local' | 'peer';
  file: SharedFileInfo;
  ownerId: string;
  ownerName: string;
  isPeerReady: boolean;
}

interface FileFeedProps {
  entries: FeedEntry[];
  transfers: TransferItem[];
  isZipping?: boolean;
  onPickFiles: () => void;
  onAddFiles: (files: FileList) => void;
  onRemoveLocalFile: (fileId: string) => void;
  onDownloadFile: (
    peerId: string,
    file: SharedFileInfo,
    useFilePicker: boolean,
  ) => void;
  onDownloadAll: (
    items: Array<{ peerId: string; fileInfo: SharedFileInfo }>,
  ) => void;
  onPreviewEntry: (entry: FeedEntry) => void;
  onCancelTransfer: (transferId: string) => void;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CardProgress({
  activeTransfer,
  completedTransfer,
}: {
  activeTransfer: TransferItem | undefined;
  completedTransfer: TransferItem | undefined;
}) {
  const [visible, setVisible] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    transferId: string;
    bytesTransferred: number;
    size: number;
    speedBps: number;
    completed: boolean;
  } | null>(null);
  const snapshotRef = useRef(snapshot);
  const hideTimerRef = useRef<number | null>(null);
  const clearTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  };

  useEffect(() => clearTimers, []);

  useEffect(() => {
    if (activeTransfer) {
      clearTimers();
      const next = {
        transferId: activeTransfer.transferId,
        bytesTransferred: activeTransfer.bytesTransferred,
        size: activeTransfer.size,
        speedBps: activeTransfer.speedBps,
        completed: false,
      };
      snapshotRef.current = next;
      setSnapshot(next);
      setVisible(true);
      return;
    }

    const current = snapshotRef.current;
    if (current && !current.completed) {
      const didComplete = completedTransfer?.transferId === current.transferId;

      if (didComplete) {
        const doneSnapshot = {
          ...current,
          bytesTransferred: current.size,
          completed: true,
        };
        snapshotRef.current = doneSnapshot;
        setSnapshot(doneSnapshot);
        hideTimerRef.current = window.setTimeout(() => {
          hideTimerRef.current = null;
          setVisible(false);
          clearTimerRef.current = window.setTimeout(() => {
            clearTimerRef.current = null;
            snapshotRef.current = null;
            setSnapshot(null);
          }, 260);
        }, 450);
      } else {
        setVisible(false);
        clearTimerRef.current = window.setTimeout(() => {
          clearTimerRef.current = null;
          snapshotRef.current = null;
          setSnapshot(null);
        }, 260);
      }
    }
  }, [activeTransfer, completedTransfer]);

  const percent =
    snapshot && snapshot.size > 0
      ? Math.min(
          100,
          Math.round((snapshot.bytesTransferred / snapshot.size) * 100),
        )
      : 0;

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        visible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        {snapshot && (
          <div className="pt-3 pl-10 sm:pl-12">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full transition-[width,background-color] duration-200 ease-out ${
                  snapshot.completed ? 'bg-emerald-400' : 'bg-blue-500'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[11px] text-zinc-400 tabular-nums">
              <span>
                {snapshot.completed
                  ? '100% · Done'
                  : `${percent}% · ${formatSpeed(snapshot.speedBps)}`}
              </span>
              <span>
                {formatBytes(snapshot.bytesTransferred)} /{' '}
                {formatBytes(snapshot.size)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return 'FILE';
  const ext = parts[parts.length - 1]?.trim().toUpperCase() ?? '';
  return ext.length > 0 && ext.length <= 5 ? ext : 'FILE';
}

function getFileTypePresentation(filename: string, mimeType: string) {
  const ext = getFileExtension(filename).toLowerCase();
  const mime = mimeType.toLowerCase();

  if (
    mime.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico', 'avif', 'bmp'].includes(
      ext,
    )
  ) {
    return { Icon: FileImage, colorClass: 'text-sky-400' };
  }
  if (
    mime.startsWith('video/') ||
    ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'].includes(ext)
  ) {
    return { Icon: FileVideo, colorClass: 'text-violet-400' };
  }
  if (
    mime.startsWith('audio/') ||
    ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)
  ) {
    return { Icon: FileAudio, colorClass: 'text-pink-400' };
  }
  if (
    ['zip', 'tar', 'gz', 'tgz', 'rar', '7z', 'xz', 'bz2'].includes(ext) ||
    mime.includes('zip') ||
    mime.includes('gzip')
  ) {
    return { Icon: FileArchive, colorClass: 'text-amber-400' };
  }
  if (
    ['csv', 'xls', 'xlsx', 'ods'].includes(ext) ||
    mime.includes('spreadsheet') ||
    mime === 'text/csv'
  ) {
    return { Icon: FileSpreadsheet, colorClass: 'text-emerald-400' };
  }
  if (
    [
      'ts',
      'tsx',
      'js',
      'jsx',
      'mjs',
      'cjs',
      'py',
      'rs',
      'go',
      'java',
      'c',
      'cpp',
      'h',
      'html',
      'css',
      'json',
      'yaml',
      'yml',
      'toml',
      'xml',
      'sh',
      'ps1',
      'ahk',
      'sql',
      'md',
    ].includes(ext)
  ) {
    return { Icon: FileCode, colorClass: 'text-lime-400' };
  }
  if (
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)
  ) {
    return { Icon: FileText, colorClass: 'text-rose-400' };
  }
  return { Icon: FileIcon, colorClass: 'text-zinc-400' };
}

const LOCAL_CARD_GRADIENT = 'from-[#111111] via-[#161618] to-[#232327]';

const REMOTE_CARD_GRADIENTS = [
  'from-[#122630] via-[#162E3A] to-[#1E3D4C]',
  'from-[#292E13] via-[#313718] to-[#3E461F]',
  'from-[#331415] via-[#3C181A] to-[#4A1F22]',
  'from-[#251330] via-[#2D183B] to-[#391F4B]',
  'from-[#121930] via-[#17203C] to-[#1F2B4D]',
  'from-[#112A1E] via-[#153325] to-[#1D4230]',
  'from-[#2E2012] via-[#382716] to-[#46311D]',
] as const;

function hashOwnerId(ownerId: string): number {
  let hash = 0;
  for (let i = 0; i < ownerId.length; i++) {
    hash = (hash * 31 + ownerId.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getEntryKey(entry: FeedEntry): string {
  return `${entry.ownerId}:${entry.file.fileId}`;
}

export function FileFeed({
  entries,
  transfers,
  isZipping = false,
  onPickFiles,
  onAddFiles,
  onRemoveLocalFile,
  onDownloadFile,
  onDownloadAll,
  onPreviewEntry,
  onCancelTransfer,
}: FileFeedProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [renderedEntries, setRenderedEntries] = useState<FeedEntry[]>(entries);
  const [removingKeys, setRemovingKeys] = useState<Set<string>>(() => new Set());
  const [enterDelays, setEnterDelays] = useState<Map<string, number>>(
    () =>
      new Map(
        entries.map((entry, idx) => [
          getEntryKey(entry),
          Math.min(idx * 45, 540),
        ]),
      ),
  );
  const renderedRef = useRef<FeedEntry[]>(entries);
  const removeTimersRef = useRef<Map<string, number>>(new Map());
  const ownerColorMapRef = useRef<Map<string, number>>(new Map());
  const dragDepthRef = useRef(0);
  const hasFsAccess = supportsFileSystemAccess();

  const getCardGradient = (ownerId: string): string => {
    if (ownerId === 'me') return LOCAL_CARD_GRADIENT;
    const map = ownerColorMapRef.current;
    let idx = map.get(ownerId);
    if (idx === undefined) {
      const used = new Set(map.values());
      const start = hashOwnerId(ownerId) % REMOTE_CARD_GRADIENTS.length;
      idx = start;
      for (let offset = 0; offset < REMOTE_CARD_GRADIENTS.length; offset++) {
        const candidate = (start + offset) % REMOTE_CARD_GRADIENTS.length;
        if (!used.has(candidate)) {
          idx = candidate;
          break;
        }
      }
      map.set(ownerId, idx);
    }
    return REMOTE_CARD_GRADIENTS[idx] ?? REMOTE_CARD_GRADIENTS[0];
  };

  useEffect(() => {
    const timers = removeTimersRef.current;
    return () => {
      for (const timerId of timers.values()) {
        window.clearTimeout(timerId);
      }
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const prevKeys = new Set(renderedRef.current.map(getEntryKey));
    const incomingMap = new Map(entries.map((e) => [getEntryKey(e), e]));
    const activeOwners = new Set(entries.map((e) => e.ownerId));
    for (const ownerId of ownerColorMapRef.current.keys()) {
      if (!activeOwners.has(ownerId)) {
        ownerColorMapRef.current.delete(ownerId);
      }
    }
    const revivedKeys: string[] = [];
    const newBatchDelays = new Map<string, number>();
    let batchIndex = 0;

    for (const key of incomingMap.keys()) {
      if (!prevKeys.has(key)) {
        newBatchDelays.set(key, Math.min(batchIndex * 45, 540));
        batchIndex += 1;
      }

      const timer = removeTimersRef.current.get(key);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        removeTimersRef.current.delete(key);
        revivedKeys.push(key);
      }
    }

    if (newBatchDelays.size > 0) {
      setEnterDelays((prev) => {
        const next = new Map(prev);
        for (const [key, delay] of newBatchDelays) {
          next.set(key, delay);
        }
        return next;
      });
    }

    const newlyRemoving: string[] = [];
    const merged: FeedEntry[] = [...entries];

    // Keep exiting items in place at their previous index while animating out
    renderedRef.current.forEach((prevItem, prevIdx) => {
      const key = getEntryKey(prevItem);
      if (incomingMap.has(key)) return;

      const insertAt = Math.min(prevIdx, merged.length);
      merged.splice(insertAt, 0, prevItem);

      if (!removeTimersRef.current.has(key)) {
        newlyRemoving.push(key);
        const timerId = window.setTimeout(() => {
          removeTimersRef.current.delete(key);
          const filtered = renderedRef.current.filter(
            (item) => getEntryKey(item) !== key,
          );
          renderedRef.current = filtered;
          setRenderedEntries(filtered);
          setRemovingKeys((prev) => {
            if (!prev.has(key)) return prev;
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }, 240);
        removeTimersRef.current.set(key, timerId);
      }
    });

    renderedRef.current = merged;
    setRenderedEntries(merged);

    if (revivedKeys.length > 0 || newlyRemoving.length > 0) {
      setRemovingKeys((prev) => {
        const next = new Set(prev);
        for (const k of revivedKeys) next.delete(k);
        for (const k of newlyRemoving) next.add(k);
        return next;
      });
    }
  }, [entries]);

  const handleDelete = (fileId: string) => {
    onRemoveLocalFile(fileId);
  };

  const downloadableEntries = entries.filter((entry) => {
    if (entry.kind !== 'peer' || !entry.isPeerReady) return false;
    return !transfers.some(
      (t) =>
        t.direction === 'incoming' &&
        t.purpose !== 'preview' &&
        t.purpose !== 'zip' &&
        t.peerId === entry.ownerId &&
        t.fileId === entry.file.fileId &&
        (t.status === 'transferring' || t.status === 'completed'),
    );
  });

  const handleDownloadAll = () => {
    if (isZipping || downloadableEntries.length === 0) return;
    onDownloadAll(
      downloadableEntries.map((entry) => ({
        peerId: entry.ownerId,
        fileInfo: entry.file,
      })),
    );
  };

  const hasFiles = (e: DragEvent<HTMLDivElement>) =>
    Array.from(e.dataTransfer.types).includes('Files');

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      onAddFiles(e.dataTransfer.files);
    }
  };

  return (
    <section
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white"
    >
      <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
            Shared Files
          </h2>
          <span className="rounded-md bg-[#EDF2F8] px-1.5 py-0.5 font-mono text-[11px] font-medium text-zinc-600 tabular-nums">
            {entries.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {(downloadableEntries.length > 0 || isZipping) && (
            <button
              type="button"
              disabled={isZipping}
              onClick={handleDownloadAll}
              className="group/btn inline-flex items-center gap-1.5 rounded-xl border border-black/[0.12] bg-[#EDF2F8] px-3 py-1.5 text-xs font-semibold text-[#111111] transition hover:border-black/[0.18] hover:bg-[#E2E9F4] active:scale-95 disabled:cursor-wait disabled:opacity-60"
              title={`Download ${downloadableEntries.length} ${downloadableEntries.length === 1 ? 'file' : 'files'} as ZIP`}
            >
              <Download className="h-3.5 w-3.5 text-blue-600 transition-transform duration-200 group-hover/btn:translate-y-0.5 motion-reduce:transition-none" />
              <span>{isZipping ? 'Zipping...' : 'Download all (.zip)'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onPickFiles}
            className="group/btn inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-500 active:scale-95"
          >
            <Plus className="h-3.5 w-3.5 transition-transform duration-200 group-hover/btn:rotate-90 motion-reduce:transition-none" />
            Share files
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {renderedEntries.length === 0 ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600">
              <FolderUp className="h-6 w-6" />
            </div>
            <p className="mt-4 text-base font-bold tracking-tight text-[#111111]">
              No files shared yet
            </p>
            <p className="mt-1 max-w-xs text-xs text-zinc-500">
              Drop files anywhere here or click Share files to send to connected
              peers.
            </p>
          </div>
        ) : (
          <ul>
            {renderedEntries.map((entry) => {
              const entryKey = getEntryKey(entry);
              const isLocal = entry.kind === 'local';
              const isRemoving = removingKeys.has(entryKey);

              const activeTransfer = !isLocal
                ? transfers.find(
                    (t) =>
                      t.direction === 'incoming' &&
                      t.peerId === entry.ownerId &&
                      t.fileId === entry.file.fileId &&
                      t.status === 'transferring',
                  )
                : undefined;

              const completedTransfer = !isLocal
                ? transfers.find(
                    (t) =>
                      t.direction === 'incoming' &&
                      t.purpose !== 'preview' &&
                      t.purpose !== 'zip' &&
                      t.peerId === entry.ownerId &&
                      t.fileId === entry.file.fileId &&
                      t.status === 'completed',
                  )
                : undefined;

              const { Icon: TypeIcon, colorClass } = getFileTypePresentation(
                entry.file.name,
                entry.file.mimeType,
              );
              const cardGradient = getCardGradient(entry.ownerId);

              return (
                <li
                  key={entryKey}
                  style={
                    !isRemoving
                      ? {
                          animationDelay: `${enterDelays.get(entryKey) ?? 0}ms`,
                        }
                      : undefined
                  }
                  className={`grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows,margin,opacity,transform] duration-240 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                    isRemoving
                      ? 'pointer-events-none mb-0 translate-x-2 scale-[0.96] grid-rows-[0fr] opacity-0'
                      : 'animate-card-enter mb-2.5 grid-rows-[1fr] last:mb-0'
                  }`}
                >
                  <div
                    className={`min-h-0 min-w-0 ${isRemoving ? 'overflow-hidden' : ''}`}
                  >
                    <div
                      className={`group rounded-2xl border border-white/[0.06] bg-gradient-to-br ${cardGradient} px-3.5 py-3 text-white shadow-[0_2px_8px_rgba(17,17,17,0.12)] transition-[filter,box-shadow] duration-200 hover:brightness-115 sm:px-5 sm:py-4`}
                    >
                      <div className="flex min-w-0 items-center justify-between gap-3 sm:gap-5">
                        {/* Left: File Icon + Metadata + Filename */}
                        <button
                          type="button"
                          onClick={() => onPreviewEntry(entry)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4"
                        >
                          <TypeIcon
                            className={`h-7 w-7 shrink-0 stroke-[1.5] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-rotate-3 group-hover:scale-110 motion-reduce:transition-none sm:h-8 sm:w-8 ${colorClass}`}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs sm:gap-x-2">
                              <Avatar
                                name={entry.ownerName}
                                sizeClass="h-4.5 w-4.5"
                                textClass="text-[9px]"
                              />
                              <span className="max-w-[9rem] truncate font-semibold text-zinc-200 sm:max-w-none">
                                {entry.ownerName}
                                {isLocal && (
                                  <span className="ml-1 font-normal text-zinc-400">
                                    (you)
                                  </span>
                                )}
                              </span>
                              <span className="text-zinc-600">·</span>
                              <span className="shrink-0 font-mono text-[11px] font-medium text-zinc-400 tabular-nums">
                                {formatTime(entry.file.sharedAt)}
                              </span>
                              <span className="text-zinc-600">·</span>
                              <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-zinc-200 tabular-nums">
                                {formatBytes(entry.file.size)}
                              </span>
                              {completedTransfer && (
                                <CheckCircle2
                                  className="h-3.5 w-3.5 shrink-0 text-emerald-400"
                                  aria-label="Downloaded"
                                />
                              )}
                            </div>

                            <p
                              className="mt-1.5 w-full max-w-[22rem] truncate text-sm font-normal tracking-tight text-white"
                              title={entry.file.name}
                            >
                              {entry.file.name}
                            </p>
                          </div>
                        </button>

                        {/* Right: Icon Actions */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onPreviewEntry(entry)}
                            className="group/btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-zinc-300 transition hover:bg-white/20 hover:text-white active:scale-90"
                            title="Preview file"
                            aria-label="Preview file"
                          >
                            <Eye className="h-4 w-4 transition-transform duration-150 group-hover/btn:scale-110 motion-reduce:transition-none" />
                          </button>

                          {isLocal ? (
                          <button
                            type="button"
                            onClick={() => handleDelete(entry.file.fileId)}
                            className="group/btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-zinc-300 transition hover:bg-rose-500/20 hover:text-rose-400 active:scale-90"
                            title="Stop sharing this file"
                            aria-label="Remove file"
                          >
                            <Trash2 className="h-4 w-4 transition-transform duration-150 group-hover/btn:-rotate-6 group-hover/btn:scale-110 motion-reduce:transition-none" />
                          </button>
                        ) : activeTransfer ? (
                          <button
                            type="button"
                            onClick={() =>
                              onCancelTransfer(activeTransfer.transferId)
                            }
                            className="group/btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-zinc-200 transition hover:bg-rose-500/20 hover:text-rose-400 active:scale-90"
                            title="Cancel download"
                            aria-label="Cancel download"
                          >
                            <X className="h-4 w-4 transition-transform duration-150 group-hover/btn:rotate-90 motion-reduce:transition-none" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!entry.isPeerReady}
                            onClick={() =>
                              onDownloadFile(
                                entry.ownerId,
                                entry.file,
                                hasFsAccess,
                              )
                            }
                            className="group/btn flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-500 active:scale-90 disabled:cursor-not-allowed disabled:opacity-35"
                            title={hasFsAccess ? 'Save to disk' : 'Download'}
                            aria-label="Download file"
                          >
                            {hasFsAccess ? (
                              <HardDriveDownload className="h-4 w-4 transition-transform duration-150 group-hover/btn:translate-y-0.5 motion-reduce:transition-none" />
                            ) : (
                              <Download className="h-4 w-4 transition-transform duration-150 group-hover/btn:translate-y-0.5 motion-reduce:transition-none" />
                            )}
                          </button>
                        )}
                        </div>
                      </div>

                      <CardProgress
                        activeTransfer={activeTransfer}
                        completedTransfer={completedTransfer}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div
        aria-hidden={!isDragging}
        className={`pointer-events-none absolute inset-0 z-20 flex p-4 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          isDragging
            ? 'scale-100 bg-[#DEE9F9]/85 opacity-100 backdrop-blur-sm'
            : 'scale-[0.985] opacity-0'
        }`}
      >
        <div
          className={`flex flex-1 items-center justify-center rounded-2xl border-2 border-dashed transition-colors duration-200 ${
            isDragging
              ? 'border-blue-600/55 bg-white/45'
              : 'border-transparent bg-transparent'
          }`}
        >
          <div
            className={`flex flex-col items-center text-center transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isDragging ? 'translate-y-0 scale-100' : 'translate-y-2 scale-95'
            }`}
          >
            <div className="relative flex h-14 w-14 items-center justify-center">
              <span className="animate-pulse-ring absolute inset-0 rounded-2xl bg-blue-600/35" />
              <div className="animate-drop-float relative flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_6px_20px_rgba(37,99,235,0.35)]">
                <FolderUp className="h-6 w-6" />
              </div>
            </div>
            <p className="mt-4 text-sm font-semibold tracking-tight text-[#111111]">
              Drop files to share
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Release to add to the room feed
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
