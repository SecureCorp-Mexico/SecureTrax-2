import { Global, Module } from '@nestjs/common';
import { LicenseService } from './license.service.js';

@Global()
@Module({
  providers: [LicenseService],
  exports: [LicenseService],
})
export class LicenseModule {}
