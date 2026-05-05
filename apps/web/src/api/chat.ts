export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatToolCallLog {
  name: string;
  input: unknown;
  ok: boolean;
}

export interface ChatResponse {
  text: string;
  iterations: number;
  toolCalls: ChatToolCallLog[];
  provider: string;
  usage: { inputTokens: number; outputTokens: number };
}

export async function chat(
  messages: ChatMessage[],
  opts: {
    token?: string;
    viewport?: { bbox?: [number, number, number, number]; selectedAssetId?: string };
    provider?: 'claude' | 'ollama';
  } = {},
): Promise<ChatResponse> {
  const res = await fetch('/api/v1/ai/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: JSON.stringify({
      messages,
      viewport: opts.viewport,
      provider: opts.provider,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`chat failed: ${res.status} ${text}`);
  }
  return (await res.json()) as ChatResponse;
}
