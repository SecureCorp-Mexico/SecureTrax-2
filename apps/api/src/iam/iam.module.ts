import { Global, Module } from '@nestjs/common';
import { IamService } from './iam.service.js';

@Global()
@Module({
  providers: [IamService],
  exports: [IamService],
})
export class IamModule {}
