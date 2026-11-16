import { describe, expect, it } from 'bun:test';
import { DataChannelControlMessageSchema } from './transfer.js';

describe('DataChannelControlMessageSchema', () => {
  it('validates file-catalog with shared files', () => {
    const result = DataChannelControlMessageSchema.safeParse({
      type: 'file-catalog',
      files: [
        {
          fileId: 'file-001',
          name: 'archive.tar.gz',
          size: 1048576,
          mimeType: 'application/gzip',
          sharedAt: 1700000000000,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('validates file-request, complete, cancel, and error messages', () => {
    expect(
      DataChannelControlMessageSchema.safeParse({
        type: 'file-request',
        transferId: 'tx-001',
        fileId: 'file-001',
      }).success,
    ).toBe(true);

    expect(
      DataChannelControlMessageSchema.safeParse({
        type: 'file-complete',
        transferId: 'tx-001',
      }).success,
    ).toBe(true);

    expect(
      DataChannelControlMessageSchema.safeParse({
        type: 'file-cancel',
        transferId: 'tx-001',
      }).success,
    ).toBe(true);

    expect(
      DataChannelControlMessageSchema.safeParse({
        type: 'transfer-error',
        transferId: 'tx-001',
        reason: 'File no longer shared',
      }).success,
    ).toBe(true);
  });

  it('rejects negative file sizes or empty fileId', () => {
    const result = DataChannelControlMessageSchema.safeParse({
      type: 'file-catalog',
      files: [
        {
          fileId: '',
          name: 'bad.bin',
          size: -10,
          mimeType: 'application/octet-stream',
          sharedAt: 1700000000000,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
