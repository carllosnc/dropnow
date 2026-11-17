import { useEffect, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileIcon,
  Loader2,
  X,
} from 'lucide-react';
import type { SharedFileInfo } from '@dropnow/shared';
import { formatBytes } from '../lib/format.js';
import {
  getPreviewKind,
  getPreviewSizeLimit,
  isPreviewWithinLimit,
} from '../lib/preview.js';
import { Avatar } from './Avatar.js';
import type { FeedEntry } from './FileFeed.js';

interface FilePreviewModalProps {
  entry: FeedEntry | null;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  getLocalFile: (fileId: string) => File | undefined;
  fetchRemotePreview: (
    peerId: string,
    fileInfo: SharedFileInfo,
    onProgress: (received: number, total: number) => void,
    signal?: AbortSignal,
  ) => Promise<Blob>;
  onDownloadFile: (peerId: string, fileInfo: SharedFileInfo) => void;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function FilePreviewModal({
  entry,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  getLocalFile,
  fetchRemotePreview,
  onDownloadFile,
}: FilePreviewModalProps) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{
    received: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  useEffect(() => {
    if (!entry) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      else if (e.key === 'ArrowRight' && hasNext) onNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [entry, hasNext, hasPrev, onClose, onNext, onPrev]);

  useEffect(() => {
    if (!entry) {
      setBlob(null);
      setObjectUrl(null);
      setTextContent(null);
      setLoading(false);
      setProgress(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let createdUrl: string | null = null;

    setBlob(null);
    setObjectUrl(null);
    setTextContent(null);
    setError(null);
    setProgress(null);
    setCopiedText(false);

    const kind = getPreviewKind(entry.file.name, entry.file.mimeType);
    const canPreview = isPreviewWithinLimit(
      entry.file.name,
      entry.file.mimeType,
      entry.file.size,
    );

    if (kind === 'unsupported' || !canPreview) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        let resolvedBlob: Blob;
        if (entry.kind === 'local') {
          const localFile = getLocalFile(entry.file.fileId);
          if (!localFile) {
            throw new Error('Local file is no longer available.');
          }
          resolvedBlob = localFile;
        } else {
          if (!entry.isPeerReady) {
            throw new Error('Peer DataChannel is not connected yet.');
          }
          resolvedBlob = await fetchRemotePreview(
            entry.ownerId,
            entry.file,
            (received, total) => {
              if (!controller.signal.aborted) {
                setProgress({ received, total });
              }
            },
            controller.signal,
          );
        }

        if (controller.signal.aborted) return;
        setBlob(resolvedBlob);

        if (kind === 'text') {
          const text = await resolvedBlob.text();
          if (!controller.signal.aborted) {
            setTextContent(text);
          }
        } else {
          createdUrl = URL.createObjectURL(resolvedBlob);
          setObjectUrl(createdUrl);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : 'Failed to load preview.',
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      controller.abort();
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [entry, fetchRemotePreview, getLocalFile]);

  if (!entry) return null;

  const kind = getPreviewKind(entry.file.name, entry.file.mimeType);
  const sizeLimit = getPreviewSizeLimit(kind);
  const tooLarge = kind !== 'unsupported' && entry.file.size > sizeLimit;
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.received / progress.total) * 100))
      : 0;

  const handleDownload = () => {
    if (blob) {
      triggerBlobDownload(blob, entry.file.name);
    } else if (entry.kind === 'peer') {
      onDownloadFile(entry.ownerId, entry.file);
    }
  };

  const handleCopyText = async () => {
    if (textContent === null) return;
    try {
      await navigator.clipboard.writeText(textContent);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      // Clipboard API may be unavailable
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${entry.file.name}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090B]/80 p-3 backdrop-blur-sm sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#141417] text-white shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              name={entry.ownerName}
              sizeClass="h-8 w-8"
              textClass="text-xs"
            />
            <div className="min-w-0">
              <p
                className="truncate text-sm font-semibold text-white"
                title={entry.file.name}
              >
                {entry.file.name}
              </p>
              <p className="text-xs text-zinc-400">
                {entry.ownerName}
                {entry.kind === 'local' ? ' (you)' : ''} ·{' '}
                <span className="font-mono">{formatBytes(entry.file.size)}</span>
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {kind === 'text' && textContent !== null && (
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                {copiedText ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedText ? 'Copied' : 'Copy'}</span>
              </button>
            )}

            {(entry.kind === 'peer' || blob !== null) && (
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/15 bg-white/10 p-2 text-zinc-300 transition hover:bg-white/20 hover:text-white"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="relative flex min-h-[300px] flex-1 items-center justify-center overflow-auto bg-[#0C0C0E] p-4 sm:p-6">
          {hasPrev && (
            <button
              type="button"
              onClick={onPrev}
              className="absolute top-1/2 left-3 z-10 -translate-y-1/2 rounded-full border border-white/15 bg-black/60 p-2 text-white backdrop-blur-sm transition hover:bg-black/80"
              aria-label="Previous file"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {hasNext && (
            <button
              type="button"
              onClick={onNext}
              className="absolute top-1/2 right-3 z-10 -translate-y-1/2 rounded-full border border-white/15 bg-black/60 p-2 text-white backdrop-blur-sm transition hover:bg-black/80"
              aria-label="Next file"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {loading ? (
            <div className="flex w-full max-w-xs flex-col items-center gap-3 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
              <p className="text-xs font-medium text-zinc-300">
                Loading P2P preview{progress ? ` (${percent}%)` : '...'}
              </p>
              {progress && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-[width] duration-150"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}
            </div>
          ) : error ? (
            <div className="flex max-w-sm flex-col items-center gap-3 text-center">
              <p className="text-sm font-medium text-rose-400">{error}</p>
              {entry.kind === 'peer' && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download file
                </button>
              )}
            </div>
          ) : kind === 'unsupported' || tooLarge ? (
            <div className="flex max-w-sm flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-zinc-300">
                <FileIcon className="h-7 w-7" />
              </div>
              <p className="text-sm font-semibold text-white">
                {tooLarge
                  ? `File exceeds ${formatBytes(sizeLimit)} inline preview limit`
                  : 'Preview not available for this file type'}
              </p>
              <p className="text-xs text-zinc-400">
                Download the file to open it on your device.
              </p>
              {entry.kind === 'peer' && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download ({formatBytes(entry.file.size)})
                </button>
              )}
            </div>
          ) : kind === 'image' && objectUrl ? (
            <img
              src={objectUrl}
              alt={entry.file.name}
              className="max-h-[72vh] max-w-full rounded-xl object-contain"
            />
          ) : kind === 'video' && objectUrl ? (
            <video
              src={objectUrl}
              controls
              playsInline
              className="max-h-[72vh] max-w-full rounded-xl bg-black"
            />
          ) : kind === 'audio' && objectUrl ? (
            <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="truncate text-sm font-medium text-white">
                {entry.file.name}
              </p>
              <audio src={objectUrl} controls className="w-full" />
            </div>
          ) : kind === 'pdf' && objectUrl ? (
            <iframe
              src={objectUrl}
              title={entry.file.name}
              className="h-[72vh] w-full rounded-xl bg-white"
            />
          ) : kind === 'text' && textContent !== null ? (
            <pre className="max-h-[72vh] w-full overflow-auto rounded-xl border border-white/10 bg-[#141417] p-4 font-mono text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap break-words">
              <code>{textContent}</code>
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}
