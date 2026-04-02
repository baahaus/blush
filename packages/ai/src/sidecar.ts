import type { Provider, CompletionResponse } from './types.js';
import { resolveProvider } from './registry.js';
import { DEFAULT_SIDECAR_MODEL } from './defaults.js';

/**
 * Sidecar -- a cheap, fast model for lightweight operations.
 *
 * Used for:
 * - Bash command safety classification
 * - Conversation summarization (for /compact and session resume)
 * - Loading message generation
 * - Context usage analysis
 *
 * Defaults to Haiku but falls back to the primary model's cheapest option.
 */

let sidecarProvider: Provider | null = null;
let sidecarModel: string | null = null;

export function configureSidecar(provider: Provider, model: string): void {
  sidecarProvider = provider;
  sidecarModel = model;
}

function getSidecar(): { provider: Provider; model: string } {
  if (sidecarProvider && sidecarModel) {
    return { provider: sidecarProvider, model: sidecarModel };
  }

  // Try Haiku first, fall back to sonnet
  try {
    const resolved = resolveProvider(DEFAULT_SIDECAR_MODEL);
    sidecarProvider = resolved.provider;
    sidecarModel = resolved.model;
    return resolved;
  } catch {
    // If no Anthropic key, try to use whatever provider is available
    try {
      const resolved = resolveProvider('gpt-4o-mini');
      sidecarProvider = resolved.provider;
      sidecarModel = resolved.model;
      return resolved;
    } catch {
      throw new Error('No sidecar model available. Set an API key for Anthropic or OpenAI.');
    }
  }
}

/**
 * Classify whether a bash command is potentially dangerous.
 * Returns { safe: boolean, reason?: string }
 */
export async function classifyBashCommand(
  command: string,
): Promise<{ safe: boolean; reason?: string }> {
  const { provider, model } = getSidecar();

  try {
    const response = await provider.complete({
      model,
      messages: [
        {
          role: 'user',
          content: `Classify this bash command as safe or dangerous. A command is dangerous if it could: delete files irreversibly, modify system configuration, send data to external servers, install malware, or cause data loss.

Command: ${command}

Respond with exactly one line:
SAFE
or
DANGEROUS: <brief reason>`,
        },
      ],
      system: 'You are a bash command safety classifier. Be concise. Only flag genuinely dangerous commands, not normal development operations like git, npm, make, etc.',
      maxTokens: 100,
      temperature: 0,
    });

    const text = extractText(response);
    const trimmed = text.trim();

    if (trimmed.startsWith('DANGEROUS')) {
      return { safe: false, reason: trimmed.replace('DANGEROUS:', '').trim() };
    }

    return { safe: true };
  } catch {
    // If sidecar unavailable, default to blocking with explanation
    return { safe: false, reason: 'Safety classifier unavailable — run without safety check or retry' };
  }
}

/**
 * Summarize a conversation for compaction or session resume titles.
 */
export async function summarizeConversation(
  messages: Array<{ role: string; content: string }>,
  maxLength = 200,
): Promise<string> {
  const { provider, model } = getSidecar();

  const conversationText = messages
    .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 500) : '[complex]'}`)
    .join('\n');

  const response = await provider.complete({
    model,
    messages: [
      {
        role: 'user',
        content: `Summarize this conversation in under ${maxLength} characters. Focus on what was accomplished, what files were changed, and any decisions made.\n\n${conversationText}`,
      },
    ],
    system: 'Produce a concise summary. No preamble.',
    maxTokens: 200,
    temperature: 0,
  });

  return extractText(response).trim();
}

/**
 * Generate a short session title from conversation content.
 */
export async function generateSessionTitle(
  firstMessage: string,
): Promise<string> {
  const { provider, model } = getSidecar();

  try {
    const response = await provider.complete({
      model,
      messages: [
        {
          role: 'user',
          content: `Generate a short title (under 50 chars) for a coding session that starts with this message:\n\n${firstMessage.slice(0, 300)}`,
        },
      ],
      system: 'Respond with just the title. No quotes, no preamble.',
      maxTokens: 50,
      temperature: 0.3,
    });

    return extractText(response).trim().slice(0, 50);
  } catch {
    return 'untitled session';
  }
}

function extractText(response: CompletionResponse): string {
  if (typeof response.message.content === 'string') {
    return response.message.content;
  }
  return response.message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('');
}
