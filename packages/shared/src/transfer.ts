import { z } from 'zod';

export const SharedFileInfoSchema = z.object({
  fileId: z.string().min(1).max(64),
  name: z.string().min(1).max(512),
  size: z.number().int().nonnegative(),
  mimeType: z.string().max(256),
  sharedAt: z.number().int().nonnegative(),
});

export type SharedFileInfo = z.infer<typeof SharedFileInfoSchema>;

export const DataChannelControlMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('file-catalog'),
    files: z.array(SharedFileInfoSchema).max(1000),
  }),
  z.object({
    type: z.literal('file-request'),
    transferId: z.string().min(1).max(64),
    fileId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal('file-complete'),
    transferId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal('file-cancel'),
    transferId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal('transfer-error'),
    transferId: z.string().min(1).max(64),
    reason: z.string(),
  }),
]);

export type DataChannelControlMessage = z.infer<typeof DataChannelControlMessageSchema>;
