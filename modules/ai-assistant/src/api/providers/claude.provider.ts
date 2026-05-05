import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type {
  ChatMessage,
  ChatProvider,
  ChatTurn,
} from './types.js';
import type { ToolDefinition } from '../tools/types.js';

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-7';
const EFFORT = (process.env.ANTHROPIC_EFFORT ?? 'high') as
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

/**
 * Anthropic-backed chat provider. Wired to Claude Opus 4.7 with adaptive
 * thinking and prompt caching on the stable prefix (system + tool catalog).
 *
 * Design notes:
 * - The runtime drives the agentic loop; this provider only renders the
 *   transcript through `messages.create`. Tool execution + RBAC scoping live
 *   in the runtime so they apply to every provider equally.
 * - The full conversation history (including any prior assistant turns with
 *   tool_use blocks) is rebuilt every call, so we don't need server-state.
 *   That's what `cursor` would carry; for Claude we don't use it.
 */
@Injectable()
export class ClaudeProvider implements ChatProvider {
  readonly id = 'claude';
  private readonly log = new Logger(ClaudeProvider.name);
  private readonly client?: Anthropic;

  constructor() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.client = new Anthropic();
    }
  }

  available(): boolean {
    return !!this.client;
  }

  async next(opts: {
    systemPrompt: string;
    tools: ToolDefinition[];
    messages: ChatMessage[];
    toolResults?: Array<{ id: string; content: string; isError?: boolean }>;
    cursor?: unknown;
  }): Promise<ChatTurn> {
    if (!this.client) throw new Error('ANTHROPIC_API_KEY not set');
    const prior = (opts.cursor as Anthropic.MessageParam[] | undefined) ?? [];

    // Conversation: prior assistant turns we already received (including
    // tool_use blocks) + this turn's tool_results carried as a user message.
    const messages: Anthropic.MessageParam[] = [];
    for (const m of opts.messages) {
      messages.push({ role: m.role, content: m.content });
    }
    for (const ev of prior) messages.push(ev);
    if (opts.toolResults?.length) {
      messages.push({
        role: 'user',
        content: opts.toolResults.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.id,
          content: r.content,
          is_error: r.isError,
        })),
      });
    }

    const tools: Anthropic.Tool[] = opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Cache the stable prefix (system + tool list).
      system: [
        {
          type: 'text',
          text: opts.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools,
      thinking: { type: 'adaptive' },
      output_config: { effort: EFFORT },
      messages,
    });

    let text = '';
    const toolCalls: ChatTurn['toolCalls'] = [];
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
      else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, input: block.input });
      }
    }

    const newCursor: Anthropic.MessageParam[] = [
      ...prior,
      { role: 'assistant', content: response.content },
    ];
    if (opts.toolResults?.length) {
      // The user message with tool_results was already added before the call;
      // keep it in the cursor so the next iteration sees full context.
      newCursor.splice(prior.length, 0, {
        role: 'user',
        content: opts.toolResults.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.id,
          content: r.content,
          is_error: r.isError,
        })),
      });
    }

    return {
      text,
      toolCalls,
      finished:
        response.stop_reason === 'end_turn' ||
        response.stop_reason === 'max_tokens',
      cursor: newCursor,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
