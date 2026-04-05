import chalk from 'chalk';
import { emitKeypressEvents } from 'node:readline';
import { getTheme } from './themes.js';
import { renderLine } from './renderer.js';

// ─────────────────────────────────────────
// Diff rendering
// ─────────────────────────────────────────

/**
 * Render a unified diff with syntax coloring:
 *   + lines → success (green)
 *   - lines → error (red)
 *   @@ hunks → accent
 *   --- / +++ headers → dim
 *   context lines → dim
 */
export function renderDiff(diff: string): void {
  if (!diff.trim()) return;
  const theme = getTheme();
  const lines = diff.split('\n');

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      renderLine(`  ${chalk.hex(theme.dim)(line)}`);
    } else if (line.startsWith('@@')) {
      renderLine(`  ${chalk.hex(theme.accent)(line)}`);
    } else if (line.startsWith('+')) {
      renderLine(`  ${chalk.hex(theme.success)(line)}`);
    } else if (line.startsWith('-')) {
      renderLine(`  ${chalk.hex(theme.error)(line)}`);
    } else {
      renderLine(`  ${chalk.hex(theme.dim)(line)}`);
    }
  }
}

/**
 * Render the confirmation prompt shown after a diff.
 * Uses a compact hint line so it doesn't obscure the diff itself.
 */
export function renderDiffConfirmPrompt(filePath: string, isNew: boolean): void {
  const theme = getTheme();
  const verb = isNew ? 'create' : 'write';

  renderLine('');
  renderLine(
    `  ${chalk.hex(theme.warning)('▸')} ${chalk.hex(theme.muted)(verb)} ${chalk.hex(theme.text).bold(filePath)}`,
  );
  renderLine(
    `  ${chalk.hex(theme.success).bold('y')} ${chalk.hex(theme.muted)('apply')}` +
    `  ${chalk.hex(theme.error).bold('n')} ${chalk.hex(theme.muted)('skip')}` +
    `  ${chalk.hex(theme.dim)('Esc  reject all')}`,
  );
}

// ─────────────────────────────────────────
// Keypress confirmation
// ─────────────────────────────────────────

interface KeyPress {
  name?: string;
  ctrl?: boolean;
  sequence?: string;
}

/**
 * Wait for a single y/n/Escape keypress and return the decision.
 * 'y' / Enter → true (apply)
 * 'n' / Escape / 'q' → false (skip)
 *
 * If stdin is not a TTY (e.g. piped input), defaults to true so
 * non-interactive runs still make progress.
 */
export function waitForDiffConfirm(): Promise<boolean> {
  if (!process.stdin.isTTY) return Promise.resolve(true);

  return new Promise((resolve) => {
    emitKeypressEvents(process.stdin);

    const wasRaw = (process.stdin as NodeJS.ReadStream & { isRaw?: boolean }).isRaw;
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    function onKey(_ch: string, key: KeyPress) {
      const name = key?.name?.toLowerCase() ?? '';
      const seq = key?.sequence ?? '';

      // Accept: y, Enter
      if (name === 'y' || name === 'return' || name === 'enter') {
        cleanup(true);
        return;
      }
      // Reject: n, Escape, q, Ctrl+C
      if (name === 'n' || name === 'escape' || name === 'q' || (key.ctrl && name === 'c')) {
        cleanup(false);
        return;
      }
      // Ignore everything else
      void seq; // suppress unused warning
    }

    function cleanup(result: boolean) {
      process.stdin.off('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw ?? false);
      resolve(result);
    }

    process.stdin.on('keypress', onKey);
  });
}
