import { Module } from '@nestjs/common';
import { LayoutsService } from './layouts.service.js';
import { VideowallController } from './videowall.controller.js';

@Module({
  controllers: [VideowallController],
  providers: [LayoutsService],
  exports: [LayoutsService],
})
export class VideowallModule {}
