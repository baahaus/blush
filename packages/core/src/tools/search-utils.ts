import { readdir, readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '.turbo',
]);

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function globToRegex(pattern: string): RegExp {
  let regex = '^';

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    const next = pattern[i + 1];

    if (char === '*') {
      if (next === '*') {
        regex += '.*';
        i++;
      } else {
        regex += '[^/]*';
      }
      continue;
    }

    if (char === '?') {
      regex += '[^/]';
      continue;
    }

    regex += escapeRegex(char);
  }

  return new RegExp(regex + '$');
}

export function resolveSearchRoot(path?: string): string {
  return resolve(path || process.cwd());
}

export function toPosixRelative(root: string, fullPath: string): string {
  return relative(root, fullPath).split(sep).join('/');
}

export async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift()!;
    let entries;

    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.gitignore') {
        if (entry.isDirectory() && !DEFAULT_IGNORED_DIRS.has(entry.name)) {
          queue.push(join(current, entry.name));
        }
        continue;
      }

      if (entry.isDirectory()) {
        if (!DEFAULT_IGNORED_DIRS.has(entry.name)) {
          queue.push(join(current, entry.name));
        }
        continue;
      }

      if (entry.isFile()) {
        files.push(join(current, entry.name));
      }
    }
  }

  return files;
}

export function isProbablyTextFile(filePath: string): boolean {
  try {
    return statSync(filePath).size <= 1024 * 1024;
  } catch {
    return false;
  }
}

export async function readTextIfPossible(filePath: string): Promise<string | null> {
  if (!isProbablyTextFile(filePath)) return null;

  try {
    const content = await readFile(filePath, 'utf-8');
    if (content.includes('\u0000')) return null;
    return content;
  } catch {
    return null;
  }
}
