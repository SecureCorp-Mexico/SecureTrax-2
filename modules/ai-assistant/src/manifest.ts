import { defineModule } from '@securetrax/module-contracts';

export const manifest = defineModule({
  id: 'ai-assistant',
  name: 'AI assistant',
  version: '0.1.0',
  category: 'core',
  description:
    'Operator chat backed by Claude (claude-opus-4-7) or a local Ollama model. Tools span the whole data plane: query_data over Postgres+Timescale, mqtt_search across the archive, find_assets, get_position_history. Every tool result is RBAC-scoped server-side, so the assistant cannot exfiltrate data the caller could not already read.',
  requires: [],
  mapLayers: [],
  api: {
    rest: '/v1/ai',
    ws: ['ai/chat/+'],
    mqtt: [],
    webhooks: ['ai.message', 'ai.tool_call'],
    permissions: [
      'ai.chat',
      'ai.tools.query_data',
      'ai.tools.mqtt_search',
      'ai.tools.find_assets',
      'ai.tools.get_position_history',
    ],
  },
});
