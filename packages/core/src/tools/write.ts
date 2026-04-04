import { Type, type Static } from '@sinclair/typebox';
import { writeFile, mkdir, lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

export const WriteParams = Type.Object({
  file_path: Type.String({ description: 'Absolute path to the file to write' }),
  content: Type.String({ description: 'The content to write to the file' }),
});

export type WriteParams = Static<typeof WriteParams>;

/** Block writes to sensitive system paths. */
const BLOCKED_PREFIXES = ['/etc/', '/usr/', '/bin/', '/sbin/', '/boot/', '/proc/', '/sys/', '/dev/'];

function isBlockedPath(filePath: string): string | null {
  const resolved = resolve(filePath);

  // Block absolute paths to sensitive system directories
  for (const prefix of BLOCKED_PREFIXES) {
    if (resolved.startsWith(prefix)) {
      return `Writes to ${prefix} are blocked for safety`;
    }
  }

  // Block writes outside of home or cwd to prevent escape
  const home = homedir();
  const cwd = process.cwd();
  if (!resolved.startsWith(home) && !resolved.startsWith(cwd)) {
    return `Writes outside of home directory and working directory are blocked`;
  }

  return null;
}

export async function write(params: WriteParams): Promise<string> {
  const { file_path, content } = params;
  const resolved = resolve(file_path);

  // Path safety check
  const blocked = isBlockedPath(resolved);
  if (blocked) {
    return `Error: ${blocked}: ${file_path}`;
  }

  // Symlink check: if parent exists, verify it's not a symlink pointing outside
  if (existsSync(resolved)) {
    try {
      const stat = await lstat(resolved);
      if (stat.isSymbolicLink()) {
        return `Error: Refusing to write through symlink: ${file_path}`;
      }
    } catch {
      // File may not exist yet, that's fine
    }
  }

  try {
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, content, 'utf-8');
    return `File written: ${file_path}`;
  } catch (err) {
    return `Error writing ${file_path}: ${(err as Error).message}`;
  }
}

export const writeTool = {
  name: 'write',
  description: 'Write content to a file. Creates directories as needed. Overwrites if exists.',
  input_schema: WriteParams,
  execute: write,
};
