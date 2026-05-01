import { z } from 'zod';

export const StreamCapability = z.enum([
  'live-webrtc',
  'live-hls',
  'snapshot',
  'ptz-onvif',
  'audio',
  'two-way-audio',
  'recording',
]);
export type StreamCapability = z.infer<typeof StreamCapability>;

export const VideoStream = z.object({
  id: z.string(),
  providerId: z.string(),
  assetId: z.string().optional(),
  label: z.string(),
  capabilities: z.array(StreamCapability).default([]),
  webrtcUrl: z.string().optional(),
  hlsUrl: z.string().optional(),
  snapshotUrl: z.string().optional(),
  videowallCapable: z.boolean().default(false),
  online: z.boolean().default(true),
});
export type VideoStream = z.infer<typeof VideoStream>;

/**
 * Implemented by every video-capable module (video-securevu, aircraft-qgc gimbal,
 * future access-hikvision, viewlink, etc.). Lets the videowall + popup player
 * stay agnostic of where the stream actually comes from.
 */
export interface VideoStreamProvider {
  readonly id: string;
  list(): Promise<VideoStream[]>;
  get(streamId: string): Promise<VideoStream | undefined>;
}
