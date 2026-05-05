export * from './license/index.js';
export * from './video/index.js';
export * from './types/index.js';
export * from './repos/index.js';
export * from './realtime/index.js';
export * from './mqtt/index.js';
export * from './iam-types/index.js';
// Side-effect: installs the express Request.principal augmentation.
export * from './express/index.js';
// Re-export LicenseClaims from module-contracts so apps/api doesn't have to
// reach into the contracts package directly for it.
export {
  LicenseClaims,
  SignedLicense,
  defineModule,
  type ModuleManifest,
} from '@securetrax/module-contracts';
