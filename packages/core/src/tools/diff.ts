import { readFile } from 'node:fs/promises';
import { writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const DIFF_TIMEOUT = 5_000;

/**
 * Generate a unified diff between two text strings.
 * Returns empty string when the texts are identical.
 */
async function unifiedDiff(oldText: string, newText: string, label: string): Promise<string> {
  if (oldText === newText) return '';

  const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const oldPath = join(tmpdir(), `blush-old-${ts}`);
  const newPath = join(tmpdir(), `blush-new-${ts}`);

  try {
    await Promise.all([
      writeFile(oldPath, oldText, 'utf-8'),
      writeFile(newPath, newText, 'utf-8'),
    ]);

    try {
      const { stdout } = await execFileAsync(
        'diff',
        ['-u', `--label=a/${label}`, `--label=b/${label}`, oldPath, newPath],
        { timeout: DIFF_TIMEOUT },
      );
      return stdout;
    } catch (err: unknown) {
      const e = err as { code?: number; stdout?: string };
      // diff exits with code 1 when files differ — that's expected
      if (e.code === 1) return e.stdout ?? '';
      return '';
    }
  } finally {
    await Promise.allSettled([unlink(oldPath), unlink(newPath)]);
  }
}

/**
 * Compute a unified diff for a Write tool call.
 * Returns empty string for new files (no baseline) or when content is unchanged.
 */
export async function computeWriteDiff(filePath: string, newContent: string): Promise<string> {
  const oldContent = existsSync(filePath) ? await readFile(filePath, 'utf-8') : '';
  return unifiedDiff(oldContent, newContent, filePath);
}

/**
 * Compute a unified diff for an Edit tool call.
 * Returns empty string if the file doesn't exist or old_string isn't found.
 */
export async function computeEditDiff(
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): Promise<string> {
  if (!existsSync(filePath)) return '';

  const content = await readFile(filePath, 'utf-8');
  if (!content.includes(oldString)) return '';

  const updated = replaceAll
    ? content.replaceAll(oldString, newString)
    : content.replace(oldString, newString);

  return unifiedDiff(content, updated, filePath);
}
