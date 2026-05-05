import {
  Body,
  Controller,
  Post,
  Req,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthRequest } from '@securetrax/core';
import { ChatRuntime } from './chat.runtime.js';
import { ChatRequestDto } from './dto.js';

const RequirePermissions = (...perms: string[]) =>
  SetMetadata('securetrax:permissions', perms);

@ApiTags('ai-assistant')
@ApiBearerAuth()
@Controller('v1/ai')
export class ChatController {
  constructor(private readonly runtime: ChatRuntime) {}

  @Post('chat')
  @RequirePermissions('ai.chat')
  @ApiOperation({
    summary:
      'Run one assistant turn end-to-end (LLM round-trip + tool-use loop). Returns the final assistant text plus a transparent log of every tool call made.',
  })
  async chat(@Req() req: AuthRequest, @Body() body: ChatRequestDto) {
    if (!req.principal) throw new UnauthorizedException();
    const viewport = body.viewport
      ? {
          bbox: body.viewport.bbox,
          selectedAssetId: body.viewport.selectedAssetId,
          timeRangeMs:
            body.viewport.fromMs && body.viewport.toMs
              ? { from: body.viewport.fromMs, to: body.viewport.toMs }
              : undefined,
        }
      : undefined;
    return await this.runtime.run(
      {
        messages: body.messages,
        viewport,
        provider: body.provider,
      },
      {
        tenantId: req.principal.tenantId,
        subjectId: req.principal.subjectId,
        permissions: req.principal.permissions,
      },
    );
  }
}
