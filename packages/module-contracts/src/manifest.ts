import { z } from 'zod';

export const ModuleCategory = z.enum(['fixed', 'vehicle', 'aircraft', 'core']);
export type ModuleCategory = z.infer<typeof ModuleCategory>;

export const ApiSurface = z.object({
  rest: z.string().optional(),
  ws: z.array(z.string()).default([]),
  mqtt: z.array(z.string()).default([]),
  webhooks: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
});
export type ApiSurface = z.infer<typeof ApiSurface>;

export const ModuleManifest = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  category: ModuleCategory,
  description: z.string().default(''),
  requires: z.array(z.string()).default([]),
  mapLayers: z.array(z.string()).default([]),
  api: ApiSurface.default({ ws: [], mqtt: [], webhooks: [], permissions: [] }),
});
export type ModuleManifest = z.infer<typeof ModuleManifest>;

export function defineModule(m: ModuleManifest): ModuleManifest {
  return ModuleManifest.parse(m);
}
