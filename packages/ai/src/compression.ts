/**
 * Wren Compression Integration
 *
 * Optional compression layer that reduces token usage by compressing:
 * - Tool output before it enters the context window
 * - System prompts and context files
 *
 * Wren is a LoRA fine-tuned 1.5B model that runs locally on Apple Silicon.
 * When unavailable, compression is silently skipped.
 *
 * Integration modes:
 * 1. CLI: calls ~/wren/bin/wren directly
 * 2. MCP: uses the Wren MCP server if available
 * 3. HTTP: calls a Wren compression endpoint
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const WREN_CLI = join(homedir(), 'wren', 'bin', 'wren');

export interface CompressionResult {
  original: string;
  compressed: string;
  ratio: number;        // compressed/original length
  tokensSaved: number;  // estimated tokens saved (chars/4)
}

export interface CompressionConfig {
  enabled: boolean;
  mode: 'cli' | 'http' | 'none';
  httpEndpoint?: string;
  minLength?: number;    // Don't compress strings shorter than this (default: 500)
}

let config: CompressionConfig = {
  enabled: false,
  mode: 'none',
};

/**
 * Auto-detect Wren installation and configure compression.
 */
export function initCompression(overrides?: Partial<CompressionConfig>): CompressionConfig {
  if (overrides?.enabled === false) {
    config = { enabled: false, mode: 'none' };
    return config;
  }

  // Check for CLI
  if (existsSync(WREN_CLI)) {
    config = {
      enabled: true,
      mode: 'cli',
      minLength: 500,
      ...overrides,
    };
    return config;
  }

  // Check for HTTP endpoint
  if (overrides?.httpEndpoint) {
    config = {
      enabled: true,
      mode: 'http',
      httpEndpoint: overrides.httpEndpoint,
      minLength: 500,
      ...overrides,
    };
    return config;
  }

  config = { enabled: false, mode: 'none', ...overrides };
  return config;
}

/**
 * Compress text using Wren.
 * Returns the original text if compression is unavailable or fails.
 */
export async function compress(
  text: string,
  mode: 'input' | 'output' = 'output',
): Promise<CompressionResult> {
  const original = text;

  if (!config.enabled || text.length < (config.minLength || 500)) {
    return { original, compressed: original, ratio: 1, tokensSaved: 0 };
  }

  try {
    if (config.mode === 'cli') {
      return compressCli(text, mode);
    } else if (config.mode === 'http') {
      return compressHttp(text, mode);
    }
  } catch {
    // Compression failed, return original
  }

  return { original, compressed: original, ratio: 1, tokensSaved: 0 };
}

function compressCli(text: string, mode: 'input' | 'output'): CompressionResult {
  // Pass text via stdin to avoid shell escaping issues
  const compressed = execSync(
    `${WREN_CLI} compress --mode ${mode}`,
    {
      input: text,
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    },
  ).trim();

  const ratio = compressed.length / text.length;
  const tokensSaved = Math.round((text.length - compressed.length) / 4);

  return {
    original: text,
    compressed,
    ratio,
    tokensSaved,
  };
}

async function compressHttp(text: string, mode: 'input' | 'output'): Promise<CompressionResult> {
  if (!config.httpEndpoint) {
    return { original: text, compressed: text, ratio: 1, tokensSaved: 0 };
  }

  const response = await fetch(config.httpEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, mode }),
  });

  if (!response.ok) {
    return { original: text, compressed: text, ratio: 1, tokensSaved: 0 };
  }

  const data = (await response.json()) as { compressed: string };
  const compressed = data.compressed;
  const ratio = compressed.length / text.length;
  const tokensSaved = Math.round((text.length - compressed.length) / 4);

  return { original: text, compressed, ratio, tokensSaved };
}

/**
 * Compress tool output before it enters the context window.
 * This is the primary integration point for the agent loop.
 */
export async function compressToolOutput(toolName: string, output: string): Promise<string> {
  if (!config.enabled) return output;

  const result = await compress(output, 'output');
  return result.compressed;
}

/**
 * Get compression stats.
 */
export function getCompressionConfig(): CompressionConfig {
  return { ...config };
}
