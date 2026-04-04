import { Type, type Static } from '@sinclair/typebox';
import {
  extractMetaDescription,
  extractTitle,
  fetchTextWithFallback,
  formatJsonText,
  htmlToText,
  isProbablyHtml,
  isProbablyJson,
  isTextLikeContentType,
  normalizeWhitespace,
  truncateText,
} from './web-utils.js';

export const WebFetchParams = Type.Object({
  url: Type.String({ description: 'The URL to fetch' }),
  max_chars: Type.Optional(Type.Number({ description: 'Maximum number of characters to return', minimum: 500, default: 12000 })),
  timeout_ms: Type.Optional(Type.Number({ description: 'Request timeout in milliseconds', minimum: 1000, default: 15000 })),
});

export type WebFetchParams = Static<typeof WebFetchParams>;

function formatBody(contentType: string, body: string, maxChars: number): {
  title?: string;
  description?: string;
  text: string;
} {
  if (isProbablyHtml(contentType, body)) {
    return {
      title: extractTitle(body) || undefined,
      description: extractMetaDescription(body) || undefined,
      text: truncateText(htmlToText(body), maxChars),
    };
  }

  if (isProbablyJson(contentType, body)) {
    return {
      text: formatJsonText(body, maxChars),
    };
  }

  if (isTextLikeContentType(contentType)) {
    return {
      text: truncateText(normalizeWhitespace(body), maxChars),
    };
  }

  return {
    text: '',
  };
}

/**
 * Check if a hostname resolves to a private/reserved IP range (SSRF protection).
 */
function isPrivateHostname(hostname: string): boolean {
  // Block obvious private/reserved hostnames
  const blocked = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '[::1]',
    'metadata.google.internal',
  ];
  if (blocked.includes(hostname.toLowerCase())) return true;

  // Block link-local and cloud metadata IPs
  const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipMatch) {
    const [, a, b] = ipMatch.map(Number);
    if (a === 10) return true;                         // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 169 && b === 254) return true;            // 169.254.0.0/16 (link-local + cloud metadata)
    if (a === 127) return true;                         // 127.0.0.0/8
    if (a === 0) return true;                           // 0.0.0.0/8
  }

  return false;
}

export async function webFetch(params: WebFetchParams): Promise<string> {
  const { url, max_chars = 12000, timeout_ms = 15000 } = params;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `Error: Invalid URL: ${url}`;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return `Error: Unsupported URL protocol: ${parsed.protocol}`;
  }

  // SSRF protection: block requests to private/internal networks
  if (isPrivateHostname(parsed.hostname)) {
    return `Error: Requests to private/internal network addresses are blocked: ${parsed.hostname}`;
  }

  try {
    const response = await fetchTextWithFallback(parsed.toString(), {
      headers: {
        'user-agent': 'blush/0.1.0 (+https://github.com/baahaus/blush)',
        accept: 'text/html,application/xhtml+xml,application/json,text/plain,application/xml;q=0.9,*/*;q=0.8',
      },
      timeoutMs: timeout_ms,
      retryWithCurlOnHttpError: true,
    });

    const lines = [
      `Fetched: ${response.url || parsed.toString()}`,
      `Status: ${response.status}`,
      `Content-Type: ${response.contentType}`,
      `Transport: ${response.via}`,
    ];

    if (!response.ok) {
      const errorBody = formatBody(response.contentType, response.text, 2000).text;
      lines.push('', errorBody || '(empty response body)');
      return lines.join('\n');
    }

    const formatted = formatBody(response.contentType, response.text, max_chars);
    if (formatted.title) {
      lines.push(`Title: ${formatted.title}`);
    }
    if (formatted.description) {
      lines.push(`Description: ${truncateText(formatted.description, 240)}`);
    }

    if (!formatted.text) {
      lines.push('', `Binary or unsupported content omitted for content type ${response.contentType}.`);
      return lines.join('\n');
    }

    lines.push('', formatted.text || '(empty response body)');
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
