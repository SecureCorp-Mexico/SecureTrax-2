import type { ToolDefinition, ToolHandlerContext } from '../tools/types.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ChatTurn {
  /** Plain assistant text the UI renders. */
  text: string;
  /** Tool calls the assistant requested in this turn. */
  toolCalls: ChatToolCall[];
  /** Whether the conversation has finished (no more tool calls expected). */
  finished: boolean;
  /** Provider-specific opaque state passed back to continue the loop. */
  cursor?: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface ChatProvider {
  readonly id: string;
  /**
   * Run one round of inference. Implementations:
   *   1. Send the conversation + tools to the underlying LLM.
   *   2. Surface text + any tool calls.
   *   3. Carry enough opaque state in `cursor` to resume after tool results.
   */
  next(opts: {
    systemPrompt: string;
    tools: ToolDefinition[];
    messages: ChatMessage[];
    /** Tool results from the previous turn, keyed by tool_use_id. */
    toolResults?: Array<{ id: string; content: string; isError?: boolean }>;
    cursor?: unknown;
  }): Promise<ChatTurn>;
}

export interface ChatRunOptions {
  /** Caller context — used to filter the tool catalog and pass into handlers. */
  ctx: ToolHandlerContext;
  /** Hard cap on tool-use loop iterations. */
  maxIterations?: number;
}
