import { Injectable, Logger } from '@nestjs/common';
import { ClaudeProvider } from './providers/claude.provider.js';
import { OllamaProvider } from './providers/ollama.provider.js';
import type { ChatMessage, ChatProvider } from './providers/types.js';
import { FindAssetsTool } from './tools/find-assets.tool.js';
import { GetPositionHistoryTool } from './tools/get-position-history.tool.js';
import { MqttSearchTool } from './tools/mqtt-search.tool.js';
import { QueryDataTool } from './tools/query-data.tool.js';
import type {
  ToolDefinition,
  ToolHandler,
  ToolHandlerContext,
} from './tools/types.js';

const SYSTEM_PROMPT = `
You are the operations assistant for a SecureTrax-2 deployment — a self-hosted
maps-based fleet/site/aircraft hub. The user is an authenticated operator
viewing the live map. Be concise and cite the data you used.

Conventions:
- Times: epoch milliseconds throughout. Render ISO-8601 in your replies.
- Coordinates: WGS84 lat/lon. Latitudes north positive, longitudes east positive.
- Asset categories: vehicle, fixed-camera, aircraft, router, intercom,
  access-control, sensor, other. Tracking-traccar feeds vehicle positions;
  video-securevu owns fixed-camera status; telemetry-mqtt mirrors the broker.

Tool use:
- Prefer typed tools (find_assets, get_position_history) for common questions.
- Use query_data for cross-cutting structured search (assets/positions/mqtt).
- Use mqtt_search for the rolling MQTT archive — answer "did topic X ever
  publish Y between time A and time B?" via SQL LIKE on \`topicLike\`.
- Tool results are RLS-scoped to the caller's tenant — you cannot reach data
  outside it. If a tool returns no rows, surface that honestly; do not invent.

If a request needs an action (writing, deploying, sending), say so and stop —
this assistant is read-only.
`.trim();

const MAX_ITERATIONS = 6;

interface ChatRequest {
  messages: ChatMessage[];
  /** Map state at chat-time, auto-injected as a context note. */
  viewport?: {
    /** Bounding box: [minLon, minLat, maxLon, maxLat]. */
    bbox?: [number, number, number, number];
    selectedAssetId?: string;
    timeRangeMs?: { from: number; to: number };
  };
  provider?: 'claude' | 'ollama';
}

interface ChatResponse {
  text: string;
  iterations: number;
  toolCalls: Array<{ name: string; input: unknown; ok: boolean }>;
  provider: string;
  usage: { inputTokens: number; outputTokens: number };
}

@Injectable()
export class ChatRuntime {
  private readonly log = new Logger(ChatRuntime.name);
  private readonly tools: ToolHandler[];

  constructor(
    private readonly claude: ClaudeProvider,
    private readonly ollama: OllamaProvider,
    findAssets: FindAssetsTool,
    history: GetPositionHistoryTool,
    mqtt: MqttSearchTool,
    query: QueryDataTool,
  ) {
    this.tools = [findAssets, history, mqtt, query];
  }

  async run(req: ChatRequest, ctx: ToolHandlerContext): Promise<ChatResponse> {
    const provider = await this.pickProvider(req.provider);
    const tools = this.toolsForCaller(ctx);
    const toolDefs: ToolDefinition[] = tools.map((t) => t.definition);
    const systemPrompt = SYSTEM_PROMPT + this.contextSuffix(req.viewport);
    const messages = [...req.messages];

    let cursor: unknown;
    let pendingResults:
      | Array<{ id: string; name: string; content: string; isError?: boolean }>
      | undefined;
    let lastText = '';
    const toolCallLog: ChatResponse['toolCalls'] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const turn = await provider.next({
        systemPrompt,
        tools: toolDefs,
        messages,
        toolResults: pendingResults,
        cursor,
      });
      cursor = turn.cursor;
      lastText = turn.text || lastText;
      inputTokens += turn.usage?.inputTokens ?? 0;
      outputTokens += turn.usage?.outputTokens ?? 0;
      if (turn.toolCalls.length === 0) break;

      pendingResults = [];
      for (const call of turn.toolCalls) {
        const handler = tools.find((t) => t.definition.name === call.name);
        if (!handler) {
          pendingResults.push({
            id: call.id,
            name: call.name,
            content: `tool ${call.name} is not available to you`,
            isError: true,
          });
          toolCallLog.push({ name: call.name, input: call.input, ok: false });
          continue;
        }
        try {
          const result = await handler.execute(call.input, ctx);
          pendingResults.push({
            id: call.id,
            name: call.name,
            content: JSON.stringify(result),
          });
          toolCallLog.push({ name: call.name, input: call.input, ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          pendingResults.push({
            id: call.id,
            name: call.name,
            content: msg,
            isError: true,
          });
          toolCallLog.push({ name: call.name, input: call.input, ok: false });
        }
      }
      if (turn.finished) break;
    }

    return {
      text: lastText,
      iterations: toolCallLog.length,
      toolCalls: toolCallLog,
      provider: provider.id,
      usage: { inputTokens, outputTokens },
    };
  }

  private async pickProvider(
    preferred?: 'claude' | 'ollama',
  ): Promise<ChatProvider> {
    if (preferred === 'ollama' && (await this.ollama.available())) return this.ollama;
    if (preferred === 'claude' && this.claude.available()) return this.claude;
    if (this.claude.available()) return this.claude;
    if (await this.ollama.available()) return this.ollama;
    throw new Error(
      'no LLM provider available — set ANTHROPIC_API_KEY or run an Ollama server',
    );
  }

  /** Filter the tool catalog by the caller's permissions. */
  private toolsForCaller(ctx: ToolHandlerContext): ToolHandler[] {
    return this.tools.filter((t) => ctx.permissions.has(t.definition.permission));
  }

  private contextSuffix(viewport?: ChatRequest['viewport']): string {
    if (!viewport) return '';
    const lines: string[] = ['', '## Current map context'];
    if (viewport.bbox) {
      lines.push(
        `Viewport bbox: minLon=${viewport.bbox[0]}, minLat=${viewport.bbox[1]}, maxLon=${viewport.bbox[2]}, maxLat=${viewport.bbox[3]}.`,
      );
    }
    if (viewport.selectedAssetId) {
      lines.push(`Selected asset: \`${viewport.selectedAssetId}\`.`);
    }
    if (viewport.timeRangeMs) {
      lines.push(
        `Active time range: ${new Date(viewport.timeRangeMs.from).toISOString()} → ${new Date(viewport.timeRangeMs.to).toISOString()}.`,
      );
    }
    return '\n' + lines.join('\n');
  }
}
