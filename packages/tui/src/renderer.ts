import chalk from 'chalk';
import { getTheme } from './themes.js';

export interface RenderOptions {
  width?: number;
  color?: string;
}

export function renderText(text: string): void {
  process.stdout.write(text);
}

export function renderLine(text: string): void {
  process.stdout.write(text + '\n');
}

export function clearLine(): void {
  process.stdout.write('\r\x1b[K');
}

export function moveCursorUp(n = 1): void {
  process.stdout.write(`\x1b[${n}A`);
}

export function renderMarkdown(text: string): string {
  // Minimal markdown rendering for terminal
  let result = text;

  // Code blocks with syntax highlighting hint
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return chalk.gray('---') + '\n' + chalk.cyan(code.trimEnd()) + '\n' + chalk.gray('---');
  });

  // Inline code
  result = result.replace(/`([^`]+)`/g, (_match, code) => chalk.cyan(code));

  // Bold
  result = result.replace(/\*\*([^*]+)\*\*/g, (_match, text) => chalk.bold(text));

  // Headers
  result = result.replace(/^(#{1,3})\s+(.+)$/gm, (_match, _hashes, text) => chalk.bold.white(text));

  return result;
}

export function renderToolStart(name: string): void {
  const theme = getTheme();
  process.stderr.write(chalk.hex(theme.dim)(`  ${name} `));
}

export function renderToolEnd(name: string, _result: string): void {
  const theme = getTheme();
  process.stderr.write(chalk.hex(theme.dim)('done\n'));
}

export function renderError(error: string): void {
  const theme = getTheme();
  process.stderr.write(chalk.hex(theme.error)(`Error: ${error}\n`));
}

export function renderStatus(parts: Record<string, string>): void {
  const line = Object.entries(parts)
    .map(([k, v]) => chalk.dim(`${k}: ${v}`))
    .join(chalk.dim(' | '));
  process.stderr.write(`\r\x1b[K${line}`);
}

export function renderPrompt(color?: string): void {
  const theme = getTheme();
  const promptChar = '>';
  const colorFn = color ? chalk.hex(color) : chalk.hex(theme.prompt);
  process.stdout.write(colorFn(`\n${promptChar} `));
}
