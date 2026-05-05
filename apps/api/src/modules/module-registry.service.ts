import { Injectable } from '@nestjs/common';
import type { ModuleManifest } from '@securetrax/module-contracts';

@Injectable()
export class ModuleRegistry {
  private readonly manifests = new Map<string, ModuleManifest>();

  register(manifest: ModuleManifest): void {
    this.manifests.set(manifest.id, manifest);
  }

  list(): ModuleManifest[] {
    return [...this.manifests.values()];
  }

  get(id: string): ModuleManifest | undefined {
    return this.manifests.get(id);
  }

  has(id: string): boolean {
    return this.manifests.has(id);
  }
}
