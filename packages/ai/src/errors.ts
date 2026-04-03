/**
 * Unified error formatting for all providers.
 * Turns raw API errors into clean, actionable messages.
 */

const STATUS_LABELS: Record<number, string> = {
  400: 'Bad request',
  401: 'Authentication failed',
  403: 'Access denied',
  404: 'Not found',
  408: 'Request timeout',
  413: 'Request too large',
  422: 'Invalid request',
  429: 'Rate limited',
  500: 'Server error',
  502: 'Bad gateway',
  503: 'Service unavailable',
  529: 'Overloaded',
};

/** Parse a raw API error body into a human-readable message. */
export function formatApiError(provider: string, status: number, raw: string): string {
  const label = STATUS_LABELS[status] || `HTTP ${status}`;

  // Try to extract a clean message from JSON
  let detail = '';
  try {
    const parsed = JSON.parse(raw);
    detail = parsed?.error?.message || parsed?.message || parsed?.detail || '';
  } catch {
    // Not JSON
  }

  if (!detail) {
    detail = raw.slice(0, 200).trim();
  }

  // Special cases with actionable guidance
  if (status === 401) {
    if (provider === 'anthropic') {
      return `Authentication failed — check your API key or Claude subscription.\n  Run: blush init`;
    }
    if (provider === 'openai') {
      return `Authentication failed — check your OpenAI API key.\n  Set OPENAI_API_KEY or run: blush init`;
    }
    if (provider === 'codex') {
      return `Authentication failed — Codex session expired.\n  Run: codex login`;
    }
  }

  if (status === 429) {
    return `Rate limited — ${detail || 'too many requests, try again shortly'}`;
  }

  if (status === 400 && detail.includes('tool_use_id')) {
    return `Message format error — tool result references missing tool call. Try /new to start a fresh session.`;
  }

  if (status === 400 && detail.includes('credit')) {
    return `Account out of credits — add billing at console.anthropic.com`;
  }

  if (status === 413 || (status === 400 && detail.includes('too long'))) {
    return `Request too large — try /compact to reduce conversation size`;
  }

  if (status >= 500) {
    return `${label} — ${detail || `${provider} is having issues, try again`}`;
  }

  return `${label} — ${detail}`;
}

/** Format a rate limit retry message for display. */
export function formatRetryMessage(waitSeconds: number): string {
  return `Rate limited, retrying in ${waitSeconds}s...`;
}

/** Format a rate limit exceeded message. */
export function formatRetryExceeded(retryAfterSeconds: string): string {
  return `Rate limited (retry-after ${retryAfterSeconds}s) — wait and try again, or switch models with /model`;
}
