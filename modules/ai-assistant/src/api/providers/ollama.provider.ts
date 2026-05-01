import { Injectable, Logger } from '@nestjs/common';
import type {
  ChatMessage,
  ChatProvider,
  ChatTurn,
} from './types.js';
import type { ToolDefinition } from '../tools/types.js';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://ollama:11434';
const MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';

interface OllamaToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

interface OllamaChatResponse {
  message: { role: 'assistant'; content: string; tool_calls?: OllamaToolCall[] };
  done: boolean;
  done_reason?: string;
}

/**
 * Local Ollama provider. Uses the OpenAI-compatible-ish `/api/chat` endpoint
 * which speaks tool-calls with a `tool_calls` field on the assistant message
 * and `role: "tool"` for results. Less capable than Claude but lets the whole
 * assistant run fully air-gapped.
 */
@Injectable()
export class OllamaProvider implements ChatProvider {
  readonly id = 'ollama';
  private readonly log = new Logger(OllamaProvider.name);

  async available(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async next(opts: {
    systemPrompt: string;
    tools: ToolDefinition[];
    messages: ChatMessage[];
    toolResults?: Array<{ id: string; name?: string; content: string; isError?: boolean }>;
    cursor?: unknown;
  }): Promise<ChatTurn> {
    const prior = (opts.cursor as OllamaMessage[] | undefined) ?? [];

    const messages: OllamaMessage[] = [
      { role: 'system', content: opts.systemPrompt },
      ...opts.messages,
      ...prior,
    ];
    if (opts.toolResults?.length) {
      for (const r of opts.toolResults) {
        messages.push({ role: 'tool', tool_name: r.name, content: r.content });
      }
    }

    const tools: OllamaToolDef[] = opts.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools,
        stream: false,
        options: { temperature: 0.2 },
      }),
    });
    if (!res.ok) {
      throw new Error(`ollama chat failed: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as OllamaChatResponse;
    const calls = body.message.tool_calls ?? [];
    const toolCalls: ChatTurn['toolCalls'] = calls.map((c, i) => ({
      id: `ollama-${Date.now()}-${i}`,
      name: c.function.name,
      input: c.function.arguments,
    }));

    const cursor: OllamaMessage[] = [
      ...prior,
      ...(opts.toolResults
        ? opts.toolResults.map((r) => ({
            role: 'tool' as const,
            tool_name: r.name,
            content: r.content,
          }))
        : []),
      {
        role: 'assistant',
        content: body.message.content ?? '',
        tool_calls: calls,
      },
    ];

    return {
      text: body.message.content ?? '',
      toolCalls,
      finished: toolCalls.length === 0 && body.done,
      cursor,
    };
  }
}
