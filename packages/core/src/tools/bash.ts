import { Type, type Static } from '@sinclair/typebox';
import { spawn } from 'node:child_process';
import { classifyBashCommand } from '@blushagent/ai';

export const BashParams = Type.Object({
  command: Type.String({ description: 'The shell command to execute' }),
  timeout: Type.Optional(Type.Number({ description: 'Timeout in milliseconds', default: 120000 })),
  cwd: Type.Optional(Type.String({ description: 'Working directory for the command' })),
});

export type BashParams = Static<typeof BashParams>;

// Set to true to enable sidecar safety checks on bash commands
let safetyCheckEnabled = false;

export function enableBashSafetyCheck(enabled: boolean): void {
  safetyCheckEnabled = enabled;
}

export async function bash(params: BashParams): Promise<string> {
  const { command, timeout = 120000, cwd } = params;

  // Optional sidecar safety check
  if (safetyCheckEnabled) {
    try {
      const classification = await classifyBashCommand(command);
      if (!classification.safe) {
        return `Command blocked by safety check: ${classification.reason || 'potentially dangerous'}\nCommand: ${command}`;
      }
    } catch {
      // If sidecar unavailable, log a warning but still allow the command
      // to avoid breaking the user's workflow. The safety check is defense-in-depth.
      process.stderr.write('Warning: bash safety sidecar unavailable, proceeding without safety check\n');
    }
  }

  return new Promise((resolve) => {
    // Filter sensitive environment variables from child process
    const SENSITIVE_ENV_PATTERNS = [
      /^ANTHROPIC_API_KEY$/i,
      /^OPENAI_API_KEY$/i,
      /^BLUSH_OAUTH_TOKEN$/i,
      /^BRAVE_SEARCH_API_KEY$/i,
      /^SERPAPI_API_KEY$/i,
      /^TAVILY_API_KEY$/i,
      /^AWS_SECRET_ACCESS_KEY$/i,
      /^GITHUB_TOKEN$/i,
      /^GH_TOKEN$/i,
      /^NPM_TOKEN$/i,
      /.*_SECRET$/i,
      /.*_PASSWORD$/i,
    ];
    const filteredEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !SENSITIVE_ENV_PATTERNS.some((p) => p.test(key))) {
        filteredEnv[key] = value;
      }
    }

    const proc = spawn('bash', ['-c', command], {
      cwd: cwd || process.cwd(),
      timeout,
      env: filteredEnv,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      let result = '';
      if (stdout) result += stdout;
      if (stderr) result += (result ? '\n' : '') + stderr;
      if (code !== 0) {
        result += (result ? '\n' : '') + `Exit code: ${code}`;
      }
      // Hard cap: truncate to ~30k chars (~8k tokens) to protect context window
      const MAX_OUTPUT = 30_000;
      if (result.length > MAX_OUTPUT) {
        const lines = result.split('\n');
        const truncated = result.slice(0, MAX_OUTPUT);
        const keptLines = truncated.split('\n').length;
        result = truncated + `\n\n[truncated: showing ${keptLines} of ${lines.length} lines]`;
      }
      resolve(result || '(no output)');
    });

    proc.on('error', (err) => {
      resolve(`Error executing command: ${err.message}`);
    });
  });
}

export const bashTool = {
  name: 'bash',
  description: 'Execute a shell command and return its output.',
  input_schema: BashParams,
  execute: bash,
};
