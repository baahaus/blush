import chalk from 'chalk';
import { getTheme } from './themes.js';
import { sym } from './symbols.js';

export interface Spinner {
  start: (label: string) => void;
  update: (label: string) => void;
  succeed: (label: string) => void;
  fail: (label: string) => void;
  stop: () => void;
}

/**
 * Animated braille spinner with organic timing.
 * Breathes instead of ticking -- slight jitter in frame rate
 * gives the impression of something alive, not mechanical.
 */
export function createSpinner(): Spinner {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let frame = 0;
  let currentLabel = '';
  let running = false;

  function nextDelay(): number {
    // Base 80ms with +/- 25ms jitter for organic feel
    return 65 + Math.random() * 50;
  }

  function render() {
    if (!running) return;
    const theme = getTheme();
    const glyph = sym.spinner[frame % sym.spinner.length];
    const line = `  ${chalk.hex(theme.accent)(glyph)} ${chalk.hex(theme.dim)(currentLabel)}`;
    process.stderr.write(`\r\x1b[K${line}`);
    frame++;
    timeout = setTimeout(render, nextDelay());
  }

  function start(label: string) {
    stop();
    currentLabel = label;
    frame = 0;
    running = true;
    render();
  }

  function update(label: string) {
    currentLabel = label;
  }

  function succeed(label: string) {
    stop();
    const theme = getTheme();
    process.stderr.write(
      `\r\x1b[K  ${chalk.hex(theme.success)(sym.toolDone)} ${chalk.hex(theme.dim)(label)}\n`,
    );
  }

  function fail(label: string) {
    stop();
    const theme = getTheme();
    process.stderr.write(
      `\r\x1b[K  ${chalk.hex(theme.error)(sym.toolFail)} ${chalk.hex(theme.dim)(label)}\n`,
    );
  }

  function stop() {
    running = false;
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    process.stderr.write('\r\x1b[K');
  }

  return { start, update, succeed, fail, stop };
}
