import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const BLUSH_CONFIG_PATH = join(homedir(), '.blush', 'config.json');

export interface ApConfig {
  anthropic_api_key?: string;
  openai_api_key?: string;
  default_model?: string;
  default_theme?: string;
  default_provider?: string;
}

let cached: ApConfig | null = null;

export function loadConfig(): ApConfig {
  if (cached) return cached;

  // Try ~/.blush/config.json
  if (existsSync(BLUSH_CONFIG_PATH)) {
    try {
      cached = JSON.parse(readFileSync(BLUSH_CONFIG_PATH, 'utf-8'));
      return cached!;
    } catch {
      // ignore malformed config
    }
  }

  // Try .env file in cwd
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const env = readFileSync(envPath, 'utf-8');
    const config: ApConfig = {};
    for (const line of env.split('\n')) {
      const [key, ...rest] = line.split('=');
      const val = rest.join('=').trim().replace(/^["']|["']$/g, '');
      if (key?.trim() === 'ANTHROPIC_API_KEY') config.anthropic_api_key = val;
      if (key?.trim() === 'OPENAI_API_KEY') config.openai_api_key = val;
    }
    cached = config;
    return config;
  }

  cached = {};
  return {};
}

export function getApiKey(provider: 'anthropic' | 'openai'): string | undefined {
  const config = loadConfig();

  if (provider === 'anthropic') {
    return config.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
  }
  if (provider === 'openai') {
    return config.openai_api_key || process.env.OPENAI_API_KEY;
  }

  return undefined;
}

export async function saveConfig(config: ApConfig): Promise<void> {
  await mkdir(join(homedir(), '.blush'), { recursive: true });
  await writeFile(BLUSH_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  cached = config;
}

export async function updateConfig(patch: Partial<ApConfig>): Promise<ApConfig> {
  const nextConfig: ApConfig = {
    ...loadConfig(),
    ...patch,
  };
  await saveConfig(nextConfig);
  return nextConfig;
}
