import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatRuntime } from './chat.runtime.js';
import { ClaudeProvider } from './providers/claude.provider.js';
import { OllamaProvider } from './providers/ollama.provider.js';
import { FindAssetsTool } from './tools/find-assets.tool.js';
import { GetPositionHistoryTool } from './tools/get-position-history.tool.js';
import { MqttSearchTool } from './tools/mqtt-search.tool.js';
import { QueryDataTool } from './tools/query-data.tool.js';

@Module({
  controllers: [ChatController],
  providers: [
    ChatRuntime,
    ClaudeProvider,
    OllamaProvider,
    FindAssetsTool,
    GetPositionHistoryTool,
    MqttSearchTool,
    QueryDataTool,
  ],
  exports: [ChatRuntime],
})
export class AiAssistantModule {}
