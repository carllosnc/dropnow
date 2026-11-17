import { describe, expect, it } from 'bun:test';
import {
  getPreviewKind,
  isPreviewWithinLimit,
  MAX_PREVIEW_BYTES,
  MAX_TEXT_PREVIEW_BYTES,
} from './preview.js';

describe('preview helpers', () => {
  it('detects preview kind from mime type and filename extension', () => {
    expect(getPreviewKind('photo.png', 'image/png')).toBe('image');
    expect(getPreviewKind('clip.mp4', 'video/mp4')).toBe('video');
    expect(getPreviewKind('song.mp3', 'audio/mpeg')).toBe('audio');
    expect(getPreviewKind('doc.pdf', 'application/pdf')).toBe('pdf');
    expect(getPreviewKind('notes.md', '')).toBe('text');
    expect(getPreviewKind('config.json', 'application/json')).toBe('text');
    expect(getPreviewKind('archive.zip', 'application/zip')).toBe('unsupported');
  });

  it('enforces size limits per preview kind', () => {
    expect(isPreviewWithinLimit('photo.png', 'image/png', 1024)).toBe(true);
    expect(
      isPreviewWithinLimit('huge.mp4', 'video/mp4', MAX_PREVIEW_BYTES + 1),
    ).toBe(false);
    expect(
      isPreviewWithinLimit('big.txt', 'text/plain', MAX_TEXT_PREVIEW_BYTES + 1),
    ).toBe(false);
    expect(isPreviewWithinLimit('archive.zip', 'application/zip', 100)).toBe(
      false,
    );
  });
});
