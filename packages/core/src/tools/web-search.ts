import { Type, type Static } from '@sinclair/typebox';
import {
  domainMatches,
  extractDuckDuckGoResults,
  fetchTextWithFallback,
  looksLikeLocationOnlyQuery,
  looksLikeWeatherQuery,
  truncateText,
  type SearchResultItem,
} from './web-utils.js';

export const WebSearchParams = Type.Object({
  query: Type.String({ description: 'Search query' }),
  limit: Type.Optional(Type.Number({ description: 'Maximum number of results to return', minimum: 1, maximum: 10, default: 5 })),
  allowed_domains: Type.Optional(Type.Array(Type.String({ description: 'Restrict results to these domains' }))),
  blocked_domains: Type.Optional(Type.Array(Type.String({ description: 'Exclude results from these domains' }))),
  timeout_ms: Type.Optional(Type.Number({ description: 'Request timeout in milliseconds', minimum: 1000, default: 15000 })),
});

export type WebSearchParams = Static<typeof WebSearchParams>;

interface BraveResult {
  title?: string;
  url?: string;
  description?: string;
}

async function searchWithBrave(
  query: string,
  limit: number,
  timeout_ms: number,
): Promise<SearchResultItem[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeout_ms);

  try {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(limit));

    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'x-subscription-token': apiKey,
      },
      signal: controller.signal,
    });

    if (!response.ok) return [];

    const data = await response.json() as { web?: { results?: BraveResult[] } };
    return (data.web?.results || [])
      .filter((item): item is Required<Pick<BraveResult, 'title' | 'url'>> & BraveResult => Boolean(item.title && item.url))
      .map((item) => ({
        title: item.title!,
        url: item.url!,
        snippet: item.description,
      }))
      .slice(0, limit);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function searchWithDuckDuckGo(
  query: string,
  limit: number,
  timeout_ms: number,
): Promise<SearchResultItem[]> {
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', query);

  const response = await fetchTextWithFallback(url.toString(), {
    headers: {
      'user-agent': 'blush/0.1.0 (+https://github.com/baahaus/blush)',
      accept: 'text/html,application/xhtml+xml',
    },
    timeoutMs: timeout_ms,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = response.text;
  return extractDuckDuckGoResults(html, limit);
}

async function searchWithBingRss(
  query: string,
  limit: number,
  timeout_ms: number,
): Promise<SearchResultItem[]> {
  const url = new URL('https://www.bing.com/search');
  url.searchParams.set('format', 'rss');
  url.searchParams.set('q', query);

  const response = await fetchTextWithFallback(url.toString(), {
    headers: {
      'user-agent': 'blush/0.1.0 (+https://github.com/baahaus/blush)',
      accept: 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
    },
    timeoutMs: timeout_ms,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const items = [...response.text.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit);
  return items.map((match) => {
    const item = match[1];
    const title = (item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const link = (item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '').trim();
    const description = (item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '')
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/&amp;/g, '&')
      .trim();
    return { title, url: link, snippet: description };
  }).filter((item) => item.title && item.url);
}

async function searchWeather(
  query: string,
  timeout_ms: number,
): Promise<SearchResultItem[]> {
  const cityMatch = query.match(/\b(?:in|for|at)\s+([a-zA-Z .'-]+?)(?:\s+(?:tomorrow|today|tonight|this weekend|next week)|$)/i);
  const location = (cityMatch?.[1] || query)
    .replace(/\b(weather|forecast|temperature|rain|snow|wind|humidity|tomorrow|today|tonight|hourly)\b/gi, '')
    .trim()
    .replace(/\s{2,}/g, ' ');

  const wttrUrl = `https://wttr.in/${encodeURIComponent(location || query)}?format=j1`;
  const response = await fetchTextWithFallback(wttrUrl, {
    headers: {
      'user-agent': 'blush/0.1.0 (+https://github.com/baahaus/blush)',
      accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
    },
    timeoutMs: timeout_ms,
  });

  if (!response.ok) return [];

  const data = JSON.parse(response.text) as {
    nearest_area?: Array<{ areaName?: Array<{ value?: string }>; region?: Array<{ value?: string }>; country?: Array<{ value?: string }> }>;
    weather?: Array<{ date?: string; maxtempF?: string; mintempF?: string; avgtempF?: string; hourly?: Array<{ time?: string; tempF?: string; chanceofrain?: string; weatherDesc?: Array<{ value?: string }> }> }>;
  };

  const nextDay = data.weather?.[1];
  const area = data.nearest_area?.[0];
  if (!nextDay) return [];

  const place = [
    area?.areaName?.[0]?.value,
    area?.region?.[0]?.value,
    area?.country?.[0]?.value,
  ].filter(Boolean).join(', ');

  const hourly = (nextDay.hourly || []).slice(0, 4).map((hour) => {
    const label = `${String(Number(hour.time || '0') / 100 || 0).padStart(2, '0')}:00`;
    const desc = hour.weatherDesc?.[0]?.value || 'Unknown';
    const temp = hour.tempF ? `${hour.tempF}F` : '';
    const rain = hour.chanceofrain ? `${hour.chanceofrain}% rain` : '';
    return [label, desc, temp, rain].filter(Boolean).join(', ');
  }).join(' | ');

  return [{
    title: `${place || location || query} weather for ${nextDay.date}`,
    url: wttrUrl,
    snippet: `High ${nextDay.maxtempF}F, low ${nextDay.mintempF}F, average ${nextDay.avgtempF}F. ${hourly}`,
  }];
}

export async function webSearch(params: WebSearchParams): Promise<string> {
  const {
    query,
    limit = 5,
    allowed_domains,
    blocked_domains,
    timeout_ms = 15000,
  } = params;

  try {
    let results: SearchResultItem[] = [];
    let provider = 'Brave Search API';

    if (looksLikeWeatherQuery(query) || looksLikeLocationOnlyQuery(query)) {
      results = await searchWeather(query, timeout_ms);
      if (results.length > 0) {
        provider = 'wttr.in weather lookup';
      }
    }

    if (results.length === 0) {
      results = await searchWithBrave(query, limit, timeout_ms);
      if (results.length > 0) {
        provider = 'Brave Search API';
      }
    }

    if (results.length === 0) {
      results = await searchWithBingRss(query, Math.max(limit * 2, limit), timeout_ms);
      if (results.length > 0) {
        provider = 'Bing RSS';
      }
    }

    if (results.length === 0) {
      results = await searchWithDuckDuckGo(query, Math.max(limit * 2, limit), timeout_ms);
      if (results.length > 0) {
        provider = 'DuckDuckGo HTML';
      }
    }

    const filtered = results
      .filter((item) => domainMatches(item.url, allowed_domains, blocked_domains))
      .slice(0, limit);

    if (filtered.length === 0) {
      return `No search results found for "${query}".`;
    }

    const lines = [
      `Search provider: ${provider}`,
      `Query: ${query}`,
      '',
      ...filtered.flatMap((item, index) => {
        const block = [
          `${index + 1}. ${item.title}`,
          `   URL: ${item.url}`,
        ];
        if (item.snippet) {
          block.push(`   Snippet: ${truncateText(item.snippet, 240)}`);
        }
        return block;
      }),
    ];

    return lines.join('\n');
  } catch (err) {
    return `Error searching the web for "${query}": ${(err as Error).message}`;
  }
}

export const webSearchTool = {
  name: 'web_search',
  description: 'Search the web for current information and return result links and snippets.',
  input_schema: WebSearchParams,
  execute: webSearch,
};
