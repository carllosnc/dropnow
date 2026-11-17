export const MAX_PREVIEW_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024; // 2 MB

export type PreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'unsupported';

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'svg',
  'ico',
  'avif',
  'bmp',
]);

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'm4v', 'ogv']);

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']);

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'css',
  'scss',
  'html',
  'htm',
  'xml',
  'svg',
  'yaml',
  'yml',
  'toml',
  'ini',
  'env',
  'csv',
  'log',
  'sql',
  'sh',
  'bash',
  'py',
  'go',
  'rs',
  'java',
  'c',
  'cpp',
  'h',
]);

function getExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) return '';
  return (parts[parts.length - 1] ?? '').trim().toLowerCase();
}

export function getPreviewKind(
  filename: string,
  mimeType: string,
): PreviewKind {
  const ext = getExtension(filename);
  const mime = mimeType.toLowerCase();

  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) {
    return 'image';
  }
  if (mime.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) {
    return 'video';
  }
  if (mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) {
    return 'audio';
  }
  if (mime === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript' ||
    mime === 'application/typescript' ||
    TEXT_EXTENSIONS.has(ext)
  ) {
    return 'text';
  }
  return 'unsupported';
}

export function getPreviewSizeLimit(kind: PreviewKind): number {
  if (kind === 'text') return MAX_TEXT_PREVIEW_BYTES;
  if (kind === 'unsupported') return 0;
  return MAX_PREVIEW_BYTES;
}

export function isPreviewWithinLimit(
  filename: string,
  mimeType: string,
  size: number,
): boolean {
  const kind = getPreviewKind(filename, mimeType);
  const limit = getPreviewSizeLimit(kind);
  return limit > 0 && size <= limit;
}
