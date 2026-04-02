import { Type, type Static } from '@sinclair/typebox';
import { extractTitle, fetchTextWithFallback, htmlToText, normalizeWhitespace, truncateText } from './web-utils.js';

export const WebFetchParams = Type.Object({
  url: Type.String({ description: 'The URL to fetch' }),
  max_chars: Type.Optional(Type.Number({ description: 'Maximum number of characters to return', minimum: 500, default: 12000 })),
  timeout_ms: Type.Optional(Type.Number({ description: 'Request timeout in milliseconds', minimum: 1000, default: 15000 })),
});

export type WebFetchParams = Static<typeof WebFetchParams>;

export async function webFetch(params: WebFetchParams): Promise<string> {
  const { url, max_chars = 12000, timeout_ms = 15000 } = params;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `Error: Invalid URL: ${url}`;
  }

  try {
    const response = await fetchTextWithFallback(parsed.toString(), {
      headers: {
        'user-agent': 'blush/0.1.0 (+https://github.com/baahaus/blush)',
        accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8',
      },
      timeoutMs: timeout_ms,
    });
    const contentType = response.contentType;
    const body = response.text;

    if (!response.ok) {
      return `Error fetching ${parsed.toString()}: HTTP ${response.status}\n${truncateText(body, 2000)}`;
    }

    const isHtml = contentType.includes('text/html') || body.includes('<html');
    const title = isHtml ? extractTitle(body) : null;
    const text = isHtml ? htmlToText(body) : normalizeWhitespace(body);
    const output = truncateText(text, max_chars);

    const lines = [
      `Fetched: ${response.url || parsed.toString()}`,
      `Status: ${response.status}`,
      `Content-Type: ${contentType}`,
    ];

    if (title) {
      lines.push(`Title: ${title}`);
    }

    lines.push('', output || '(empty response body)');
    return lines.join('\n');
  } catch (err) {
    return `Error fetching ${parsed.toString()}: ${(err as Error).message}`;
  }
}

export const webFetchTool = {
  name: 'web_fetch',
  description: 'Fetch a URL and return readable text content from the response.',
  input_schema: WebFetchParams,
  execute: webFetch,
};
