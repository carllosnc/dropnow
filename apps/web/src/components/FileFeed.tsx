import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  CheckCircle2,
  Download,
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
  onAddFiles: (files: FileList) => void;
  onRemoveLocalFile: (fileId: string) => void;
  onDownloadFile: (
    peerId: string,
    file: SharedFileInfo,
    useFilePicker: boolean,
  ) => void;
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
          <div className="pt-3 pl-12">
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

function getFileTypeIcon(filename: string, mimeType: string) {
  const ext = getFileExtension(filename).toLowerCase();
  const mime = mimeType.toLowerCase();

  if (
    mime.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico', 'avif', 'bmp'].includes(
      ext,
    )
  ) {
    return FileImage;
  }
  if (
    mime.startsWith('video/') ||
    ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'].includes(ext)
  ) {
    return FileVideo;
  }
  if (
    mime.startsWith('audio/') ||
    ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)
  ) {
    return FileAudio;
  }
  if (
    ['zip', 'tar', 'gz', 'tgz', 'rar', '7z', 'xz', 'bz2'].includes(ext) ||
    mime.includes('zip') ||
    mime.includes('gzip')
  ) {
    return FileArchive;
  }
  if (
    ['csv', 'xls', 'xlsx', 'ods'].includes(ext) ||
    mime.includes('spreadsheet') ||
    mime === 'text/csv'
  ) {
    return FileSpreadsheet;
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
    return FileCode;
  }
  if (
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)
  ) {
    return FileText;
  }
  return FileIcon;
}

export function FileFeed({
  entries,
  transfers,
  onAddFiles,
  onRemoveLocalFile,
  onDownloadFile,
  onCancelTransfer,
}: FileFeedProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set());
  const removeTimersRef = useRef<Map<string, number>>(new Map());
  const dragDepthRef = useRef(0);
  const hasFsAccess = supportsFileSystemAccess();

  useEffect(() => {
    const timers = removeTimersRef.current;
    return () => {
      for (const timerId of timers.values()) {
        window.clearTimeout(timerId);
      }
      timers.clear();
    };
  }, []);

  const handleDelete = (fileId: string) => {
    if (removingIds.has(fileId)) return;
    setRemovingIds((prev) => {
      const next = new Set(prev);
      next.add(fileId);
      return next;
    });
    const timerId = window.setTimeout(() => {
      removeTimersRef.current.delete(fileId);
      onRemoveLocalFile(fileId);
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }, 240);
    removeTimersRef.current.set(fileId, timerId);
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
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
    >
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {entries.length === 0 ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600">
              <FolderUp className="h-6 w-6" />
            </div>
            <p className="mt-4 text-base font-bold tracking-tight text-[#111111]">
              No files shared yet
            </p>
            <p className="mt-1 max-w-xs text-xs text-zinc-500">
              Drop files anywhere here or click the + button to share with
              connected peers.
            </p>
          </div>
        ) : (
          <ul>
            {entries.map((entry) => {
              const isLocal = entry.kind === 'local';
              const isRemoving = isLocal && removingIds.has(entry.file.fileId);

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
                      t.peerId === entry.ownerId &&
                      t.fileId === entry.file.fileId &&
                      t.status === 'completed',
                  )
                : undefined;

              const TypeIcon = getFileTypeIcon(
                entry.file.name,
                entry.file.mimeType,
              );

              return (
                <li
                  key={`${entry.ownerId}:${entry.file.fileId}`}
                  className={`grid transition-[grid-template-rows,margin,opacity,transform] duration-240 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                    isRemoving
                      ? 'pointer-events-none mb-0 translate-x-2 scale-[0.96] grid-rows-[0fr] opacity-0'
                      : 'animate-card-enter mb-2.5 grid-rows-[1fr] last:mb-0'
                  }`}
                >
                  <div className={`min-h-0 ${isRemoving ? 'overflow-hidden' : ''}`}>
                    <div className="group rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#111111] via-[#151517] to-[#232327] px-5 py-4 text-white shadow-[0_2px_8px_rgba(17,17,17,0.12)] transition-[filter,box-shadow] duration-200 hover:brightness-115">
                      <div className="flex items-center justify-between gap-5">
                        {/* Left: File Icon + Metadata + Filename */}
                        <div className="flex min-w-0 flex-1 items-center gap-4">
                          <TypeIcon
                            className={`h-8 w-8 shrink-0 stroke-[1.5] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-rotate-3 group-hover:scale-110 motion-reduce:transition-none ${
                              isLocal ? 'text-zinc-300' : 'text-white'
                            }`}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                              <Avatar
                                name={entry.ownerName}
                                sizeClass="h-4.5 w-4.5"
                                textClass="text-[9px]"
                              />
                              <span className="truncate font-semibold text-zinc-200">
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
                            </div>

                            <p
                              className="mt-1.5 max-w-[22rem] truncate text-sm font-normal tracking-tight text-white"
                              title={entry.file.name}
                            >
                              {entry.file.name}
                            </p>
                          </div>
                        </div>

                        {/* Right: Icon Action */}
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
                          <div className="flex shrink-0 items-center gap-2">
                            {completedTransfer && (
                              <CheckCircle2
                                className="h-4 w-4 text-emerald-400"
                                aria-label="Downloaded"
                              />
                            )}
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
                              className="group/btn flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-500 active:scale-90 disabled:cursor-not-allowed disabled:opacity-35"
                              title={hasFsAccess ? 'Save to disk' : 'Download'}
                              aria-label="Download file"
                            >
                              {hasFsAccess ? (
                                <HardDriveDownload className="h-4 w-4 transition-transform duration-150 group-hover/btn:translate-y-0.5 motion-reduce:transition-none" />
                              ) : (
                                <Download className="h-4 w-4 transition-transform duration-150 group-hover/btn:translate-y-0.5 motion-reduce:transition-none" />
                              )}
                            </button>
                          </div>
                        )}
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
            ? 'scale-100 bg-[#EDF2FA]/85 opacity-100 backdrop-blur-sm'
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
