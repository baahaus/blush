/**
 * Stream-aware markdown renderer.
 *
 * Processes text chunks as they arrive from the LLM and returns
 * ANSI-styled output. Tracks state across chunks for patterns
 * that span boundaries (bold, code blocks, inline code).
 *
 * Handles: code blocks, inline code, bold, headers, bullet lists,
 * numbered lists, horizontal rules. Skips italic (ambiguous with
 * bullets in streaming context).
 */
import chalk from 'chalk';
import { getTheme } from './themes.js';
import { sym, rule } from './symbols.js';

export class StreamMarkdown {
  private pending = '';
  private inCodeBlock = false;
  private inBold = false;
  private inCode = false;
  private atLineStart = true;

  /** Process a streaming chunk and return styled output. */
  process(chunk: string): string {
    const input = this.pending + chunk;
    this.pending = '';
    let output = '';
    const theme = getTheme();

    let i = 0;
    while (i < input.length) {
      const remaining = input.length - i;
      const c = input[i];

      // ── Code block toggle (``` at line start) ──
      if (c === '`' && input[i + 1] === '`' && input[i + 2] === '`' && this.atLineStart) {
        if (this.inCodeBlock) {
          this.inCodeBlock = false;
          output += chalk.hex(theme.border)(rule(30, sym.thinRule));
          i += 3;
          while (i < input.length && input[i] !== '\n') i++;
          continue;
        } else {
          this.inCodeBlock = true;
          i += 3;
          let lang = '';
          while (i < input.length && input[i] !== '\n') { lang += input[i++]; }
          lang = lang.trim();
          output += lang
            ? `${chalk.hex(theme.border)(`${sym.boxTL}${sym.boxH.repeat(2)}`)} ${chalk.hex(theme.muted)(lang)} ${chalk.hex(theme.border)(sym.boxH.repeat(20))}`
            : chalk.hex(theme.border)(rule(30, sym.thinRule));
          continue;
        }
      }
      // Might be code block but chunk ended too early -- buffer
      if (c === '`' && this.atLineStart && !this.inCodeBlock && !this.inCode && remaining < 3) {
        this.pending = input.slice(i);
        break;
      }

      // ── Inside code block: style as code, skip inline markdown ──
      if (this.inCodeBlock) {
        if (c === '\n') {
          output += '\n';
          this.atLineStart = true;
        } else {
          output += chalk.hex(theme.dim)(c);
          this.atLineStart = false;
        }
        i++;
        continue;
      }

      // ── Newline ──
      if (c === '\n') {
        output += '\n';
        this.atLineStart = true;
        // Don't reset inBold across lines -- bold can span lines in LLM output
        i++;
        continue;
      }

      // ── Inline code toggle ──
      if (c === '`') {
        this.inCode = !this.inCode;
        i++;
        this.atLineStart = false;
        continue;
      }
      if (this.inCode) {
        output += chalk.hex(theme.accent)(c);
        this.atLineStart = false;
        i++;
        continue;
      }

      // ── Bold toggle (**) ──
      if (c === '*' && input[i + 1] === '*') {
        this.inBold = !this.inBold;
        i += 2;
        continue;
      }
      // Single * at end of chunk -- might be start of **
      if (c === '*' && remaining < 2) {
        this.pending = input.slice(i);
        break;
      }

      // ── Horizontal rule (--- at line start) ──
      if (c === '-' && input[i + 1] === '-' && input[i + 2] === '-' && this.atLineStart) {
        let j = i + 3;
        while (j < input.length && input[j] === '-') j++;
        if (j >= input.length || input[j] === '\n') {
          output += chalk.hex(theme.muted)(rule(40, sym.thinRule));
          i = j;
          this.atLineStart = false;
          continue;
        }
      }

      // ── Headers (# at line start) ──
      if (c === '#' && this.atLineStart) {
        let level = 0;
        let j = i;
        while (j < input.length && input[j] === '#' && level < 4) { level++; j++; }
        if (j < input.length && input[j] === ' ') {
          j++; // skip space
          let heading = '';
          while (j < input.length && input[j] !== '\n') { heading += input[j++]; }
          const color = level === 1 ? theme.prompt : level === 2 ? theme.accent : theme.text;
          output += chalk.hex(color).bold(heading);
          i = j;
          this.atLineStart = false;
          continue;
        }
        if (j >= input.length) {
          // Incomplete -- buffer for next chunk
          this.pending = input.slice(i);
          break;
        }
      }

      // ── Bullet lists (- or * followed by space, at line start) ──
      if (c === '-' && input[i + 1] === ' ' && this.atLineStart) {
        output += `${chalk.hex(theme.prompt)(sym.bullet)} `;
        i += 2;
        this.atLineStart = false;
        continue;
      }
      if (c === '*' && input[i + 1] === ' ' && this.atLineStart) {
        output += `${chalk.hex(theme.prompt)(sym.bullet)} `;
        i += 2;
        this.atLineStart = false;
        continue;
      }

      // ── Numbered lists (N. at line start) ──
      if (c >= '0' && c <= '9' && this.atLineStart) {
        let numStr = c;
        let j = i + 1;
        while (j < input.length && input[j] >= '0' && input[j] <= '9') {
          numStr += input[j++];
        }
        if (j + 1 < input.length && input[j] === '.' && input[j + 1] === ' ') {
          output += `${chalk.hex(theme.dim)(`${numStr}.`)} `;
          i = j + 2;
          this.atLineStart = false;
          continue;
        }
        if (j >= input.length) {
          // Might be incomplete number -- buffer
          this.pending = input.slice(i);
          break;
        }
      }

      // ── Regular character ──
      if (this.inBold) {
        output += chalk.hex(theme.text).bold(c);
      } else {
        output += c;
      }
      this.atLineStart = false;
      i++;
    }

    return output;
  }

  /** Flush pending buffer at end of response. */
  flush(): string {
    const theme = getTheme();
    let out = '';
    if (this.pending) {
      out = this.inBold ? chalk.hex(theme.text).bold(this.pending) : this.pending;
      this.pending = '';
    }
    if (this.inCodeBlock) {
      out += '\n' + chalk.hex(theme.border)(rule(30, sym.thinRule));
      this.inCodeBlock = false;
    }
    return out;
  }

  /** Reset all state for a new response. */
  reset(): void {
    this.pending = '';
    this.inCodeBlock = false;
    this.inBold = false;
    this.inCode = false;
    this.atLineStart = true;
  }
}
