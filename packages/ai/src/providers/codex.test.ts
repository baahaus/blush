import { describe, expect, it } from 'vitest';
import { getCodexFunctionCallInput, toCodexInput } from './codex.js';
import type { Message } from '../types.js';

describe('toCodexInput', () => {
  it('preserves separate function item ids and call ids across tool replay', () => {
    const messages: Message[] = [
      { role: 'user', content: 'whats the weather like tomorrow in pittsburgh' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'fc_123',
            call_id: 'call_123',
            name: 'web_search',
            input: { query: 'pittsburgh weather tomorrow' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_123',
            content: 'Search provider: DuckDuckGo HTML',
          },
        ],
      },
    ];

    const input = toCodexInput(messages) as Array<Record<string, unknown>>;

    expect(input[1]).toMatchObject({
      type: 'function_call',
      id: 'fc_123',
      call_id: 'call_123',
      name: 'web_search',
    });
    expect(input[2]).toMatchObject({
      type: 'function_call_output',
      call_id: 'call_123',
      output: 'Search provider: DuckDuckGo HTML',
    });
  });
});

describe('getCodexFunctionCallInput', () => {
  it('reads arguments from the initial function_call item', () => {
    expect(getCodexFunctionCallInput({
      type: 'function_call',
      arguments: '{"command":"ls ~/Desktop"}',
    })).toBe('{"command":"ls ~/Desktop"}');
  });

  it('falls back to structured input fields', () => {
    expect(getCodexFunctionCallInput({
      type: 'function_call',
      input: { query: 'desktop files' },
    })).toBe('{"query":"desktop files"}');
  });

  it('reads nested function arguments when present', () => {
    expect(getCodexFunctionCallInput({
      type: 'function_call',
      function: { arguments: '{"command":"pwd"}' },
    })).toBe('{"command":"pwd"}');
  });

  it('serializes structured arguments on output item completion', () => {
    expect(getCodexFunctionCallInput({
      type: 'function_call',
      arguments: { command: 'ls ~/Desktop' },
    })).toBe('{"command":"ls ~/Desktop"}');
  });
});
