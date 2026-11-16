import type { SignalingRoom } from './signaling-room.js';

export interface Env {
  SIGNALING_ROOM: DurableObjectNamespace<SignalingRoom>;
  ASSETS: Fetcher;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}
