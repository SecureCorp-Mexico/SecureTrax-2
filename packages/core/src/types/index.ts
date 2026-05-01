import { z } from 'zod';

export const AssetCategory = z.enum([
  'vehicle',
  'fixed-camera',
  'aircraft',
  'router',
  'intercom',
  'access-control',
  'sensor',
  'other',
]);
export type AssetCategory = z.infer<typeof AssetCategory>;

export const Asset = z.object({
  id: z.string(),
  tenantId: z.string(),
  siteId: z.string().nullable().optional(),
  groupId: z.string().nullable().optional(),
  name: z.string(),
  category: AssetCategory,
  tags: z.array(z.string()).default([]),
  cameraBindings: z.array(z.string()).default([]),
  attrs: z.record(z.unknown()).default({}),
});
export type Asset = z.infer<typeof Asset>;

export const Position = z.object({
  assetId: z.string(),
  ts: z.number().int(),
  lat: z.number(),
  lon: z.number(),
  alt: z.number().optional(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  attrs: z.record(z.unknown()).default({}),
});
export type Position = z.infer<typeof Position>;

export const Telemetry = z.object({
  assetId: z.string(),
  ts: z.number().int(),
  metric: z.string(),
  value: z.union([z.number(), z.string(), z.boolean()]),
  unit: z.string().optional(),
});
export type Telemetry = z.infer<typeof Telemetry>;

export const Alert = z.object({
  id: z.string(),
  assetId: z.string().optional(),
  ts: z.number().int(),
  severity: z.enum(['info', 'warning', 'critical']),
  source: z.string(),
  message: z.string(),
  attrs: z.record(z.unknown()).default({}),
});
export type Alert = z.infer<typeof Alert>;
