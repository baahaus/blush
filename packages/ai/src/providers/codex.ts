import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import type {
  Provider,
  ProviderConfig,
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  ContentBlock,
  TokenUsage,
  Message,
} from '../types.js';
import { DEFAULT_CODEX_MODEL } from '../defaults.js';
import { formatApiError } from '../errors.js';

const CODEX_AUTH_PATH = join(homedir(), '.codex', 'auth.json');
const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';

interface CodexAuth {
  auth_mode: string;
  tokens: {
    access_token: string;
    refresh_token: string;
  };
  last_refresh: string;
}

function stringifyFunctionArguments(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return '';
}

export function getCodexFunctionCallInput(item: Record<string, unknown> | undefined): string {
  if (!item) return '';

  const directArguments = stringifyFunctionArguments(item.arguments);
  if (directArguments) return directArguments;

  const directInput = stringifyFunctionArguments(item.input);
  if (directInput) return directInput;

  const fn = item.function;
  if (fn && typeof fn === 'object') {
    const nestedArguments = stringifyFunctionArguments((fn as Record<string, unknown>).arguments);
    if (nestedArguments) return nestedArguments;
  }

  return '';
}

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return true;
    const payload = JSON.parse(
      Buffer.from(parts[1] + '='.repeat(4 - (parts[1].length % 4)), 'base64url').toString()
    );
    return payload.exp ? payload.exp < Date.now() / 1000 + 300 : false;
  } catch {
    return false;
  }
}

function refreshCodexToken(): void {
  try {
    execSync('codex --version', { stdio: 'ignore', timeout: 15000 });
  } catch { /* best-effort */ }
}

function loadCodexToken(): string {
  if (!existsSync(CODEX_AUTH_PATH)) {
    throw new Error('Codex auth not found. Log in first with:\n  codex login');
  }

  const auth: CodexAuth = JSON.parse(readFileSync(CODEX_AUTH_PATH, 'utf-8'));

  if (auth.auth_mode !== 'chatgpt' || !auth.tokens?.access_token) {
    throw new Error('Codex auth.json does not contain ChatGPT OAuth tokens.\nLog in with: codex login');
  }

  if (isTokenExpired(auth.tokens.access_token)) {
    refreshCodexToken();
    const refreshed: CodexAuth = JSON.parse(readFileSync(CODEX_AUTH_PATH, 'utf-8'));
    if (!refreshed.tokens?.access_token || isTokenExpired(refreshed.tokens.access_token)) {
      throw new Error('Codex OAuth token expired and refresh failed.\nRe-login with: codex login');
    }
    return refreshed.tokens.access_token;
  }

  return auth.tokens.access_token;
}

export function toCodexInput(messages: Message[]): unknown[] {
  const input: unknown[] = [];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      input.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
      continue;
    }

    const toolResults = msg.content.filter((b) => b.type === 'tool_result');
    if (toolResults.length > 0) {
      for (const tr of toolResults) {
        if (tr.type === 'tool_result') {
          input.push({
            type: 'function_call_output',
            call_id: tr.tool_use_id,
            output: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
          });
        }
      }
      continue;
    }

    const toolUses = msg.content.filter((b) => b.type === 'tool_use');
    const textBlocks = msg.content.filter((b) => b.type === 'text');
    const text = textBlocks.map((b) => (b.type === 'text' ? b.text : '')).join('');

    if (text) {
      input.push({ role: 'assistant', content: text });
    }

    for (const tu of toolUses) {
      if (tu.type === 'tool_use') {
        input.push({
          type: 'function_call',
          id: tu.id,
          call_id: tu.call_id || tu.id,
          name: tu.name,
          arguments: JSON.stringify(tu.input),
        });
      }
    }

    if (!text && toolUses.length === 0) {
      input.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: '' });
    }
  }

  return input;
}

function toTools(request: CompletionRequest): unknown[] | undefined {
  if (!request.tools?.length) return undefined;
  return request.tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  }));
}

export function createCodexProvider(config: ProviderConfig): Provider {
  const token = loadCodexToken();
  const baseUrl = config.baseUrl || CODEX_BASE_URL;

  async function* stream(request: CompletionRequest): AsyncIterable<StreamEvent> {
    // Codex Responses API: stream-only, store=false, no max_output_tokens/temperature
    const body: Record<string, unknown> = {
      model: request.model || config.defaultModel || DEFAULT_CODEX_MODEL,
      instructions: request.system || 'You are a helpful assistant.',
      input: toCodexInput(request.messages),
      store: false,
      stream: true,
    };

    const tools = toTools(request);
    if (tools) body.tools = tools;

    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      yield { type: 'error', error: formatApiError('codex', response.status, error) };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const pendingToolCalls = new Map<string, { id: string; name: string; input: string; callId?: string }>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data) continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }

        const type = event.type as string;

        if (type === 'response.output_text.delta') {
          const delta = event.delta as string;
          if (delta) yield { type: 'text', text: delta };
        } else if (type === 'response.output_item.added') {
          const item = event.item as Record<string, unknown>;
          if (item?.type === 'function_call') {
            const itemId = item.id as string || '';
            const callId = item.call_id as string || itemId;
            const name = item.name as string || '';
            const input = getCodexFunctionCallInput(item);
            pendingToolCalls.set(callId, { id: itemId || callId, name, input, callId });
            yield { type: 'tool_use_start', toolUse: { id: itemId || callId, name, input, callId } };
          }
        } else if (type === 'response.function_call_arguments.delta') {
          const callId = event.call_id as string || event.item_id as string || '';
          const existing = pendingToolCalls.get(callId);
          if (existing) {
            existing.input += event.delta as string || '';
            yield { type: 'tool_use_delta', toolUse: { ...existing } };
          }
        } else if (type === 'response.function_call_arguments.done') {
          const callId = event.call_id as string || event.item_id as string || '';
          const tc = pendingToolCalls.get(callId);
          if (tc) {
            tc.input = stringifyFunctionArguments(event.arguments) || tc.input;
            yield { type: 'tool_use_end', toolUse: { ...tc, callId } };
            pendingToolCalls.delete(callId);
          }
        } else if (type === 'response.output_item.done') {
          const item = event.item as Record<string, unknown> | undefined;
          if (item?.type === 'function_call') {
            const itemId = item.id as string || '';
            const callId = item.call_id as string || itemId;
            const name = item.name as string || '';
            const input = getCodexFunctionCallInput(item);
            const existing = pendingToolCalls.get(callId);
            const toolUse = {
              id: itemId || callId,
              name: existing?.name || name,
              input: input || existing?.input || '',
              callId,
            };
            yield { type: 'tool_use_end', toolUse };
            pendingToolCalls.delete(callId);
          }
        } else if (type === 'response.completed') {
          // Extract usage from the completed response
          const resp = event.response as Record<string, unknown> | undefined;
          const usage = resp?.usage as Record<string, number> | undefined;
          if (usage) {
            yield {
              type: 'usage',
              usage: {
                inputTokens: usage.input_tokens || 0,
                outputTokens: usage.output_tokens || 0,
              },
            };
          }
          for (const tc of pendingToolCalls.values()) {
            yield { type: 'tool_use_end', toolUse: { ...tc } };
          }
          yield { type: 'done' };
        }
      }
    }
  }

  // complete() implemented via streaming since Codex requires stream=true
  async function complete(request: CompletionRequest): Promise<CompletionResponse> {
    const blocks: ContentBlock[] = [];
    let currentText = '';
    const toolCalls: Array<{ id: string; name: string; input: string; callId?: string }> = [];
    let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';
    let tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

    for await (const event of stream(request)) {
      if (event.type === 'text') {
        currentText += event.text;
      } else if (event.type === 'tool_use_end' && event.toolUse) {
        toolCalls.push(event.toolUse);
      } else if (event.type === 'usage' && event.usage) {
        tokenUsage = event.usage;
      } else if (event.type === 'error') {
        throw new Error(event.error);
      }
    }

    if (currentText) {
      blocks.push({ type: 'text', text: currentText });
    }

    for (const tc of toolCalls) {
      blocks.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.name,
        input: JSON.parse(tc.input || '{}'),
        call_id: tc.callId,
      });
      stopReason = 'tool_use';
    }

    if (blocks.length === 0) {
      blocks.push({ type: 'text', text: '' });
    }

    return {
      message: { role: 'assistant', content: blocks },
      usage: tokenUsage,
      stopReason,
    };
  }

  return {
    name: 'codex',
    stream,
    complete,
    models: () => [
      'gpt-5.4', 'gpt-5.4-mini',
      'gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.2',
      'gpt-5.1-codex', 'gpt-5.1', 'gpt-5-codex', 'gpt-5',
    ],
  };
}
