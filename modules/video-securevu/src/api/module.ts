import { Module } from '@nestjs/common';
import { SecureVuController } from './securevu.controller.js';
import { FrigateRuntime } from './frigate.runtime.js';

@Module({
  controllers: [SecureVuController],
  providers: [FrigateRuntime],
  exports: [FrigateRuntime],
})
export class VideoSecureVuModule {}
