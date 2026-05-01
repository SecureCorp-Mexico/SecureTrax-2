import type { Asset } from '../types/index.js';

export interface IAssetsRepository {
  list(): Promise<Asset[]>;
  get(id: string): Promise<Asset | undefined>;
  upsert(input: Omit<Asset, 'tenantId'>): Promise<Asset>;
}

/** DI token. Apps wire a concrete `IAssetsRepository`; modules consume it. */
export const ASSETS_REPOSITORY = Symbol.for('securetrax.assets-repository');
