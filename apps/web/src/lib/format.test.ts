import { describe, expect, it } from 'bun:test';
import {
  formatBytes,
  formatEta,
  formatSpeed,
  generateDeviceName,
  generateId,
  getAvatarUrl,
} from './format.js';

describe('format helpers', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
    expect(formatBytes(1024 ** 3 * 3)).toBe('3.0 GB');
  });

  it('formats transfer speed', () => {
    expect(formatSpeed(0)).toBe('0 B/s');
    expect(formatSpeed(1024 * 500)).toBe('500 KB/s');
  });

  it('formats ETA seconds', () => {
    expect(formatEta(0)).toBe('--');
    expect(formatEta(Infinity)).toBe('--');
    expect(formatEta(45)).toBe('45s');
    expect(formatEta(125)).toBe('2m 5s');
    expect(formatEta(3665)).toBe('1h 1m');
  });

  it('generates device names and random IDs', () => {
    const name = generateDeviceName();
    expect(name.split(' ').length).toBe(2);

    const id = generateId(10);
    expect(id).toMatch(/^[a-z0-9]{10}$/);
  });

  it('builds encoded DiceBear avatar URLs', () => {
    expect(getAvatarUrl('Amber Falcon')).toBe(
      'https://api.dicebear.com/9.x/thumbs/svg?seed=Amber%20Falcon',
    );
    expect(getAvatarUrl('   ')).toBe(
      'https://api.dicebear.com/9.x/thumbs/svg?seed=dropnow',
    );
  });
});
