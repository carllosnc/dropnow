import { z } from 'zod';

export const PeerIdSchema = z
  .string()
  .min(4)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid peerId format');

export const RoomIdSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid roomId format');

export const DisplayNameSchema = z.string().trim().min(1).max(40);

export const PeerInfoSchema = z.object({
  peerId: PeerIdSchema,
  displayName: DisplayNameSchema,
});

export type PeerInfo = z.infer<typeof PeerInfoSchema>;

export const SessionDescriptionSchema = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().min(1),
});

export const IceCandidatePayloadSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});

// Client -> Server signaling messages
export const JoinMessageSchema = z.object({
  type: z.literal('join'),
  roomId: RoomIdSchema,
  peerId: PeerIdSchema,
  displayName: DisplayNameSchema,
  password: z.string().max(128).optional(),
});

export const OfferMessageSchema = z.object({
  type: z.literal('offer'),
  targetPeerId: PeerIdSchema,
  sdp: SessionDescriptionSchema.extend({ type: z.literal('offer') }),
});

export const AnswerMessageSchema = z.object({
  type: z.literal('answer'),
  targetPeerId: PeerIdSchema,
  sdp: SessionDescriptionSchema.extend({ type: z.literal('answer') }),
});

export const IceCandidateMessageSchema = z.object({
  type: z.literal('ice-candidate'),
  targetPeerId: PeerIdSchema,
  candidate: IceCandidatePayloadSchema,
});

export const ShutdownRoomMessageSchema = z.object({
  type: z.literal('shutdown-room'),
});

export const ClientSignalingMessageSchema = z.discriminatedUnion('type', [
  JoinMessageSchema,
  OfferMessageSchema,
  AnswerMessageSchema,
  IceCandidateMessageSchema,
  ShutdownRoomMessageSchema,
]);

export type ClientSignalingMessage = z.infer<typeof ClientSignalingMessageSchema>;

// Server -> Client signaling messages
export const RoomPeersMessageSchema = z.object({
  type: z.literal('room-peers'),
  roomId: RoomIdSchema,
  peers: z.array(PeerInfoSchema),
  isHost: z.boolean().optional(),
});

export const PeerJoinedMessageSchema = z.object({
  type: z.literal('peer-joined'),
  peer: PeerInfoSchema,
});

export const PeerLeftMessageSchema = z.object({
  type: z.literal('peer-left'),
  peerId: PeerIdSchema,
});

export const RelayedOfferMessageSchema = z.object({
  type: z.literal('offer'),
  fromPeerId: PeerIdSchema,
  sdp: SessionDescriptionSchema.extend({ type: z.literal('offer') }),
});

export const RelayedAnswerMessageSchema = z.object({
  type: z.literal('answer'),
  fromPeerId: PeerIdSchema,
  sdp: SessionDescriptionSchema.extend({ type: z.literal('answer') }),
});

export const RelayedIceCandidateMessageSchema = z.object({
  type: z.literal('ice-candidate'),
  fromPeerId: PeerIdSchema,
  candidate: IceCandidatePayloadSchema,
});

export const SignalingErrorMessageSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
});

export const RoomClosedMessageSchema = z.object({
  type: z.literal('room-closed'),
  reason: z.string(),
});

export const ServerSignalingMessageSchema = z.discriminatedUnion('type', [
  RoomPeersMessageSchema,
  PeerJoinedMessageSchema,
  PeerLeftMessageSchema,
  RelayedOfferMessageSchema,
  RelayedAnswerMessageSchema,
  RelayedIceCandidateMessageSchema,
  SignalingErrorMessageSchema,
  RoomClosedMessageSchema,
]);

export type ServerSignalingMessage = z.infer<typeof ServerSignalingMessageSchema>;

// TURN / ICE server response
export const IceServerSchema = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});

export const TurnCredentialsResponseSchema = z.object({
  iceServers: z.array(IceServerSchema),
  turnEnabled: z.boolean(),
  ttl: z.number().int().positive().optional(),
});

export type IceServerConfig = z.infer<typeof IceServerSchema>;
export type TurnCredentialsResponse = z.infer<typeof TurnCredentialsResponseSchema>;
