import { Global, Module } from '@nestjs/common';
import { BROADCASTER } from '@securetrax/core';
import { RealtimeGateway } from './realtime.gateway.js';

@Global()
@Module({
  providers: [
    RealtimeGateway,
    { provide: BROADCASTER, useExisting: RealtimeGateway },
  ],
  exports: [RealtimeGateway, BROADCASTER],
})
export class RealtimeModule {}
