const ansiPattern = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

function visibleLength(str: string): number {
  return str.replace(ansiPattern, '').length;
}

export function prefixStreamChunk(
  text: string,
  prefix: string | { first: string; continuation?: string },
  lineStart = true,
  col = 0,
): { output: string; lineStart: boolean; col: number } {
  let output = '';
  let atLineStart = lineStart;
  let usedChunkPrefix = false;
  let currentCol = col;
  const columns = process.stdout.columns || 80;

  const firstPrefix = typeof prefix === 'string' ? prefix : prefix.first;
  const continuationPrefix = typeof prefix === 'string' ? prefix : (prefix.continuation || prefix.first);
  const prefixWidth = visibleLength(continuationPrefix);

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    // Handle explicit newlines
    if (char === '\n') {
      output += '\n';
      atLineStart = true;
      currentCol = 0;
      i++;
      continue;
    }

    // Emit prefix at line start
    if (atLineStart) {
      output += !usedChunkPrefix ? firstPrefix : continuationPrefix;
      usedChunkPrefix = true;
      atLineStart = false;
      currentCol = prefixWidth;
    }

    // Pass through ANSI escape sequences without counting width
    if (char === '\x1B') {
      const match = text.slice(i).match(/^\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/);
      if (match) {
        output += match[0];
        i += match[0].length;
        continue;
      }
    }

    // Soft-wrap before exceeding terminal width
    if (currentCol >= columns) {
      output += '\n' + continuationPrefix;
      currentCol = prefixWidth;
    }

    output += char;
    currentCol++;
    i++;
  }

  return { output, lineStart: atLineStart, col: currentCol };
}

export function assistantPrefix(prefixLabel: string, continuationPrefix: string): {
  first: string;
  continuation: string;
} {
  return {
    first: prefixLabel,
    continuation: continuationPrefix,
  };
}

function truncateSingleLine(text: string, maxLength = 56): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength - 1).trimEnd() + '\u2026';
}

export function summarizeToolInput(name: string, input: Record<string, unknown>): string | undefined {
  if (name === 'bash' && typeof input.command === 'string' && input.command.trim()) {
    return truncateSingleLine(input.command);
  }

  if ((name === 'read' || name === 'write' || name === 'edit') && typeof input.file_path === 'string') {
    return truncateSingleLine(input.file_path, 48);
  }

  if (name === 'grep' && typeof input.pattern === 'string') {
    const path = typeof input.path === 'string' ? ` in ${input.path}` : '';
    return truncateSingleLine(`${input.pattern}${path}`);
  }

  if (name === 'glob' && typeof input.pattern === 'string') {
    return truncateSingleLine(input.pattern);
  }

  if (name === 'web_search' && typeof input.query === 'string') {
    return truncateSingleLine(input.query);
  }

  if (name === 'web_fetch' && typeof input.url === 'string') {
    return truncateSingleLine(input.url);
  }

  if (name === 'todo' && typeof input.action === 'string') {
    return truncateSingleLine(input.action);
  }

  return undefined;
}
