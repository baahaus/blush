import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function htmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');

  const withBreaks = withoutScripts
    .replace(/<\/(p|div|section|article|main|header|footer|aside|li|ul|ol|h\d|tr|table|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');

  const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
  return normalizeWhitespace(decodeHtmlEntities(stripped));
}

export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  return normalizeWhitespace(decodeHtmlEntities(match[1]));
}

function decodeSearchHref(href: string): string | null {
  try {
    if (href.startsWith('//')) {
      return `https:${href}`;
    }

    if (href.startsWith('/l/?') || href.startsWith('https://duckduckgo.com/l/?')) {
      const url = new URL(href, 'https://duckduckgo.com');
      const uddg = url.searchParams.get('uddg');
      return uddg ? decodeURIComponent(uddg) : null;
    }

    if (href.startsWith('http://') || href.startsWith('https://')) {
      return href;
    }
  } catch {
    return null;
  }

  return null;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet?: string;
}

export function extractDuckDuckGoResults(html: string, limit = 8): SearchResultItem[] {
  const results: SearchResultItem[] = [];
  const seen = new Set<string>();

  const patterns = [
    /<a[^>]+class="[^"]*(?:result__a|result-link)[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const url = decodeSearchHref(match[1]);
      if (!url || seen.has(url)) continue;

      const title = normalizeWhitespace(decodeHtmlEntities(match[2].replace(/<[^>]+>/g, ' ')));
      if (!title || title.length < 3) continue;
      if (title.toLowerCase().includes('duckduckgo')) continue;

      seen.add(url);
      results.push({ title, url });
      if (results.length >= limit) return results;
    }
  }

  return results;
}

export function truncateText(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function domainMatches(urlString: string, allowedDomains?: string[], blockedDomains?: string[]): boolean {
  try {
    const hostname = new URL(urlString).hostname.toLowerCase();

    if (blockedDomains?.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return false;
    }

    if (allowedDomains?.length) {
      return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    }

    return true;
  } catch {
    return false;
  }
}

export function looksLikeWeatherQuery(query: string): boolean {
  const lowered = query.toLowerCase();
  return /\b(weather|forecast|temperature|rain|snow|wind|humidity|tomorrow|tonight|hourly)\b/.test(lowered);
}

export function looksLikeLocationOnlyQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;

  if (/^\d{5}(?:-\d{4})?$/.test(trimmed)) {
    return true;
  }

  if (/^[a-zA-Z .'-]+,\s*[A-Z]{2}$/.test(trimmed) || /^[a-zA-Z .'-]+\s+[A-Z]{2}$/.test(trimmed)) {
    return true;
  }

  if (/^[a-zA-Z .'-]+,\s*[A-Za-z ]+$/.test(trimmed)) {
    return true;
  }

  return false;
}

export async function fetchTextWithFallback(
  url: string,
  options?: {
    headers?: Record<string, string>;
    timeoutMs?: number;
  },
): Promise<{ ok: boolean; status: number; url: string; contentType: string; text: string }> {
  const headers = options?.headers || {};
  const timeoutMs = options?.timeoutMs || 15000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      url: response.url || url,
      contentType: response.headers.get('content-type') || 'application/octet-stream',
      text,
    };
  } catch {
    const args = [
      '-L',
      '-sS',
      '--max-time',
      String(Math.max(1, Math.ceil(timeoutMs / 1000))),
      ...Object.entries(headers).flatMap(([key, value]) => ['-H', `${key}: ${value}`]),
      '-D',
      '-',
      url,
    ];

    const { stdout } = await execFileAsync('curl', args, {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    });

    const splitIndex = stdout.lastIndexOf('\r\n\r\n') >= 0
      ? stdout.lastIndexOf('\r\n\r\n')
      : stdout.lastIndexOf('\n\n');
    const rawHeaders = splitIndex >= 0 ? stdout.slice(0, splitIndex) : '';
    const text = splitIndex >= 0 ? stdout.slice(splitIndex + (stdout.includes('\r\n\r\n') ? 4 : 2)) : stdout;
    const headerBlock = rawHeaders.split(/\r?\n\r?\n/).pop() || '';
    const headerLines = headerBlock.split(/\r?\n/).filter(Boolean);
    const statusLine = headerLines[0] || '';
    const statusMatch = statusLine.match(/HTTP\/\d(?:\.\d)?\s+(\d{3})/);
    const status = statusMatch ? Number(statusMatch[1]) : 200;
    const contentTypeLine = headerLines.find((line) => line.toLowerCase().startsWith('content-type:'));
    const contentType = contentTypeLine ? contentTypeLine.split(':').slice(1).join(':').trim() : 'application/octet-stream';

    return {
      ok: status >= 200 && status < 300,
      status,
      url,
      contentType,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}
