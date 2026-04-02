function envFlag(name: string): boolean {
  const value = process.env[name];
  return value === '1' || value === 'true';
}

export function prefersReducedMotion(): boolean {
  return envFlag('BLUSH_REDUCED_MOTION')
    || envFlag('CI')
    || process.env.TERM === 'dumb';
}

export async function pause(ms: number): Promise<void> {
  if (ms <= 0 || prefersReducedMotion()) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reveal text character by character to stderr.
 * Fast enough to feel alive, not slow enough to annoy.
 */
export async function typeOut(
  text: string,
  stream: NodeJS.WriteStream = process.stderr,
  charDelay = 18,
): Promise<void> {
  if (prefersReducedMotion()) {
    stream.write(text);
    return;
  }
  for (const char of text) {
    stream.write(char);
    if (char !== ' ') {
      await new Promise((r) => setTimeout(r, charDelay + Math.random() * 12));
    }
  }
}

/**
 * Stagger an array of lines with a delay between each.
 * Calls a render function for each line.
 */
export async function staggerLines(
  lines: string[],
  renderFn: (line: string) => void,
  delayMs = 30,
): Promise<void> {
  for (const [i, line] of lines.entries()) {
    renderFn(line);
    if (i < lines.length - 1) {
      await pause(delayMs);
    }
  }
}

/**
 * Draw a horizontal rule progressively left-to-right.
 */
export async function drawRule(
  char: string,
  width: number,
  colorFn: (s: string) => string,
  stream: NodeJS.WriteStream = process.stderr,
  stepMs = 3,
): Promise<void> {
  if (prefersReducedMotion() || width <= 0) {
    stream.write(colorFn(char.repeat(width)));
    return;
  }
  // Draw in fast bursts of 4 characters
  const burst = 4;
  for (let i = 0; i < width; i += burst) {
    const count = Math.min(burst, width - i);
    stream.write(colorFn(char.repeat(count)));
    await new Promise((r) => setTimeout(r, stepMs));
  }
}
