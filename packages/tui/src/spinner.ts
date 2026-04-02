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
 * Thinking phrases that rotate during long operations.
 * Product-specific, not generic AI slop.
 */
const thinkingPhrases = [
  'thinking',
  'reasoning',
  'considering',
  'working through it',
  'forming a plan',
  'reading the code',
  'putting it together',
];

/**
 * Animated braille spinner with organic timing.
 * Breathes instead of ticking -- slight jitter in frame rate
 * gives the impression of something alive, not mechanical.
 *
 * After a few seconds, the label subtly shifts to a new thinking
 * phrase if no explicit update arrives.
 */
export function createSpinner(): Spinner {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let frame = 0;
  let currentLabel = '';
  let baseLabel = '';
  let phraseIndex = 0;
  let running = false;
  let startedAt = 0;
  let lastPhraseAt = 0;

  function nextDelay(): number {
    // Base 80ms with +/- 25ms jitter for organic feel
    return 65 + Math.random() * 50;
  }

  function render() {
    if (!running) return;
    const theme = getTheme();
    const glyph = sym.spinner[frame % sym.spinner.length];

    // Rotate thinking phrases every ~4s if label hasn't been manually updated
    const elapsed = Date.now() - startedAt;
    if (elapsed > 3000 && Date.now() - lastPhraseAt > 4000 && baseLabel === currentLabel) {
      phraseIndex = (phraseIndex + 1) % thinkingPhrases.length;
      currentLabel = thinkingPhrases[phraseIndex];
      lastPhraseAt = Date.now();
    }

    const line = `  ${chalk.hex(theme.accent)(glyph)} ${chalk.hex(theme.muted)(currentLabel)}`;
    process.stderr.write(`\r\x1b[K${line}`);
    frame++;
    timeout = setTimeout(render, nextDelay());
  }

  function start(label: string) {
    stop();
    currentLabel = label;
    baseLabel = label;
    phraseIndex = 0;
    frame = 0;
    running = true;
    startedAt = Date.now();
    lastPhraseAt = Date.now();
    render();
  }

  function update(label: string) {
    currentLabel = label;
    baseLabel = label;
    lastPhraseAt = Date.now();
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
