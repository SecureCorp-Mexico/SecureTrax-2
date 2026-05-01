import { Global, Module } from '@nestjs/common';
import { ModuleRegistry } from './module-registry.service.js';

@Global()
@Module({
  providers: [ModuleRegistry],
  exports: [ModuleRegistry],
})
export class ModuleRegistryModule {}
