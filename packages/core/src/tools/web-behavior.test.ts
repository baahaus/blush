import { afterEach, describe, expect, it, vi } from 'vitest';

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

import { webFetch } from './web-fetch.js';
import { webSearch } from './web-search.js';

const originalBraveKey = process.env.BRAVE_SEARCH_API_KEY;

afterEach(() => {
  if (originalBraveKey === undefined) {
    delete process.env.BRAVE_SEARCH_API_KEY;
  } else {
    process.env.BRAVE_SEARCH_API_KEY = originalBraveKey;
  }

  vi.unstubAllGlobals();
  execFileMock.mockReset();
});

describe('web_fetch behavior', () => {
  it('falls back to curl and returns readable page text', async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network unavailable');
    }));

    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(null, {
        stdout: [
          'HTTP/1.1 200 OK',
          'content-type: text/html; charset=utf-8',
          '',
          '<html><head><title>Example Page</title></head><body><main><h1>Headline</h1><p>Readable text here.</p></main></body></html>',
        ].join('\r\n'),
      });
    });

    const result = await webFetch({ url: 'https://example.com/page', max_chars: 500 });

    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(result).toContain('Fetched: https://example.com/page');
    expect(result).toContain('Status: 200');
    expect(result).toContain('Content-Type: text/html; charset=utf-8');
    expect(result).toContain('Title: Example Page');
    expect(result).toContain('Headline');
    expect(result).toContain('Readable text here.');
    expect(result).not.toContain('<html');
  });
});

describe('web_search behavior', () => {
  it('prefers Brave first and then returns Bing RSS results in a model-usable shape', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = input.toString();

      if (url.includes('api.search.brave.com')) {
        return new Response('brave failed', { status: 503 });
      }

      if (url.includes('bing.com/search')) {
        return new Response(
          [
            '<rss><channel>',
            '<item>',
            '<title>OpenAI Pricing</title>',
            '<link>https://openai.com/pricing</link>',
            '<description><![CDATA[Plans and pricing for API access.]]></description>',
            '</item>',
            '</channel></rss>',
          ].join(''),
          { status: 200, headers: { 'content-type': 'application/rss+xml' } },
        );
      }

      throw new Error(`unexpected url: ${url}`);
    }));

    const result = await webSearch({ query: 'openai api pricing', limit: 3 });

    expect(result).toContain('Search provider: Bing RSS');
    expect(result).toContain('Query: openai api pricing');
    expect(result).toContain('1. OpenAI Pricing');
    expect(result).toContain('URL: https://openai.com/pricing');
    expect(result).toContain('Snippet: Plans and pricing for API access.');
  });

  it('falls back through DuckDuckGo HTML when earlier providers fail', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = input.toString();

      if (url.includes('api.search.brave.com')) {
        return new Response('brave failed', { status: 503 });
      }

      if (url.includes('bing.com/search')) {
        return new Response('<rss><channel></channel></rss>', {
          status: 200,
          headers: { 'content-type': 'application/rss+xml' },
        });
      }

      if (url.includes('html.duckduckgo.com')) {
        return new Response(
          [
            '<a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.typescriptlang.org%2Fdocs%2F">TypeScript Handbook</a>',
            '<a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">Example Docs</a>',
          ].join(''),
          { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
      }

      throw new Error(`unexpected url: ${url}`);
    }));

    const result = await webSearch({ query: 'typescript parser docs', limit: 2 });

    expect(result).toContain('Search provider: DuckDuckGo HTML');
    expect(result).toContain('Query: typescript parser docs');
    expect(result).toContain('1. TypeScript Handbook');
    expect(result).toContain('URL: https://www.typescriptlang.org/docs/');
    expect(result).toContain('2. Example Docs');
    expect(result).not.toContain('<a class="result__a"');
  });
});
