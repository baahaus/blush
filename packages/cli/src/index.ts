import chalk from 'chalk';
import { resolveProvider, type StreamEvent } from '@blush/ai';
import { createAgent, saveSession, loadSession, listSessions, branchAt, SkillRegistry } from '@blush/core';
import {
  createInput,
  isCommand,
  parseCommand,
  renderText,
  renderLine,
  renderMarkdown,
  renderToolStart,
  renderToolEnd,
  renderError,
  renderPrompt,
  setTheme,
  getTheme,
  listThemes,
} from '@blush/tui';
import { btw, compact, copy, showContext, showDiff, showSuggestions, handleTeamCommand, showSkills } from './commands/index.js';

const VERSION = '0.1.0';

interface CliOptions {
  model: string;
  color?: string;
  theme?: string;
  print?: string;
  rpc?: boolean;
  json?: boolean;
  resume?: boolean;
  sessionId?: string;
  newSession?: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    model: process.env.BLUSH_MODEL || 'claude-sonnet-4-20250514',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--model' || arg === '-m') {
      opts.model = args[++i];
    } else if (arg === '--color') {
      opts.color = args[++i];
    } else if (arg === '--print' || arg === '-p') {
      opts.print = args[++i];
    } else if (arg === '--resume' || arg === '-r') {
      opts.resume = true;
    } else if (arg === '--session' || arg === '-s') {
      opts.sessionId = args[++i];
    } else if (arg === '--new' || arg === '-n') {
      opts.newSession = true;
    } else if (arg === '--theme' || arg === '-t') {
      opts.theme = args[++i];
    } else if (arg === '--rpc') {
      opts.rpc = true;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--version' || arg === '-v') {
      console.log(`blush ${VERSION}`);
      process.exit(0);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === 'sessions') {
      listSessionsCommand().then(() => process.exit(0));
      return opts;
    } else if (arg === 'init') {
      import('./commands/init.js').then((m) => m.init()).then(() => process.exit(0));
      return opts;
    } else if (arg === 'install') {
      const source = args[++i] || '';
      import('./commands/packages.js').then((m) => m.installPackage(source)).then(() => process.exit(0));
      return opts;
    } else if (arg === 'list' || arg === 'packages') {
      import('./commands/packages.js').then((m) => m.listPackages()).then(() => process.exit(0));
      return opts;
    } else if (arg === 'remove' || arg === 'uninstall') {
      const pkg = args[++i] || '';
      import('./commands/packages.js').then((m) => m.removePackage(pkg)).then(() => process.exit(0));
      return opts;
    } else if (!arg.startsWith('-')) {
      opts.print = arg;
    }
  }

  return opts;
}

async function listSessionsCommand(): Promise<void> {
  const cwd = process.cwd();
  const sessions = await listSessions(cwd);
  if (sessions.length === 0) {
    console.log(chalk.dim('No sessions found for this directory.'));
    return;
  }
  console.log(chalk.bold('Sessions:'));
  for (const id of sessions) {
    console.log(`  ${id}`);
  }
}

function printHelp(): void {
  console.log(`
${chalk.bold('blush')} -- Team CLI Agent from ap.haus

${chalk.bold('Usage:')}
  blush                      Interactive mode (new session)
  blush -p "question"          Print mode (single response)
  blush -p "q" --json          Print mode with JSON output
  blush --rpc                  RPC mode (JSONL over stdin/stdout)
  blush -r, --resume           Resume last session
  blush -s, --session <id>     Resume specific session
  blush -n, --new              Force new session
  blush -m <model>             Set model (anthropic/openai/ollama/url)
  blush -t, --theme <name>     Set color theme
  blush --color <hex>          Set prompt color

${chalk.bold('Subcommands:')}
  blush init                   First-time setup (create ~/.blush, config)
  blush sessions               List sessions for current directory
  blush install <source>       Install package (npm:pkg, user/repo, git:url)
  blush list                   List installed packages
  blush remove <name>          Remove a package

${chalk.bold('Commands:')}
  /btw <question>           Ephemeral question (no history)
  /compact [focus]          Compress conversation
  /branch                   Fork conversation at current point
  /context                  Show context window usage
  /diff                     Show uncommitted git changes
  /model <name>             Switch model
  /team <subcommand>        Team management
  /skills                   List installed skills
  /theme [name]             Set or show color theme
  /save                     Save session now
  /sessions                 List sessions
  /copy [N]                 Copy Nth response to clipboard
  /help                     Show this help
  /exit                     Exit

${chalk.bold('Keys:')}
  Enter                     Send message
  !command                  Run shell command directly
  Ctrl+C                    Exit
  `);
}

export async function run(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  // RPC mode: JSONL over stdin/stdout, no TUI
  if (opts.rpc) {
    const { runRpc } = await import('./rpc.js');
    await runRpc(opts.model);
    return;
  }

  let currentModel = opts.model;
  const cwd = process.cwd();

  // Apply theme
  if (opts.theme) {
    if (!setTheme(opts.theme)) {
      console.error(`Unknown theme: ${opts.theme}. Available: ${listThemes().join(', ')}`);
    }
  }

  // Load skills
  const skills = new SkillRegistry();
  const skillCount = await skills.loadAll(cwd);
  if (skillCount > 0) {
    console.log(chalk.dim(`Loaded ${skillCount} skill(s)`));
  }

  // Handle session resume -- load before creating agent
  let existingSession: Awaited<ReturnType<typeof loadSession>> | undefined = undefined;
  if (opts.resume || opts.sessionId) {
    const sessions = await listSessions(cwd);
    const targetId = opts.sessionId || sessions[sessions.length - 1];
    if (targetId) {
      const loaded = await loadSession(cwd, targetId);
      if (loaded) {
        existingSession = loaded;
        console.log(chalk.dim(`Resumed session: ${targetId} (${loaded.entries.length} messages)`));
      } else {
        console.log(chalk.dim(`Session not found: ${targetId}, starting new`));
      }
    }
  }

  // Lazy agent creation -- defer provider resolution until first use
  let agent: Awaited<ReturnType<typeof createAgent>> | null = null;

  async function getAgent() {
    if (agent) return agent;

    const { provider, model: resolvedModel } = resolveProvider(currentModel);
    currentModel = resolvedModel;

    agent = await createAgent({
      provider,
      model: currentModel,
      cwd,
      session: existingSession || undefined,
      onStream: (event: StreamEvent) => {
        switch (event.type) {
          case 'text':
            renderText(event.text || '');
            break;
          case 'thinking':
            renderText(chalk.dim(event.text || ''));
            break;
          case 'error':
            renderError(event.error || 'Unknown error');
            break;
        }
      },
      onToolStart: (name) => {
        renderText('\n');
        renderToolStart(name);
      },
      onToolEnd: (name, result) => {
        renderToolEnd(name, result);
      },
    });

    return agent;
  }

  // Print mode: needs agent immediately
  if (opts.print) {
    try {
      const a = await getAgent();
      const response = await a.send(opts.print);
      if (opts.json) {
        const text = typeof response.content === 'string'
          ? response.content
          : response.content
              .filter((b) => b.type === 'text')
              .map((b) => (b.type === 'text' ? b.text : ''))
              .join('');
        console.log(JSON.stringify({
          content: text,
          usage: a.usage.total,
          session: a.session.id,
        }));
      } else {
        renderText('\n');
      }
    } catch (err) {
      renderError((err as Error).message);
    }
    process.exit(0);
  }

  // Interactive mode -- starts immediately, no API key needed
  console.log(chalk.dim(`blush ${VERSION} | ${currentModel} | /help for commands`));

  const input = createInput();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    renderText('\n');
    if (agent) {
      await saveSession(agent.session);
      console.log(chalk.dim(`Session saved: ${agent.session.id}`));
    }
    input.close();
    process.exit(0);
  });

  const handleCommand = async (name: string, args: string): Promise<boolean> => {
    switch (name) {
      // --- Commands that DON'T need the agent/API key ---
      case 'diff':
        showDiff();
        return true;

      case 'skills':
        showSkills(skills);
        return true;

      case 'theme': {
        if (!args) {
          const current = getTheme();
          const available = listThemes();
          renderLine(chalk.dim(`Current: ${current.name}`));
          renderLine(chalk.dim(`Available: ${available.join(', ')}`));
          return true;
        }
        if (setTheme(args.trim())) {
          const t = getTheme();
          renderLine(chalk.hex(t.prompt)(`Theme set: ${t.name}`));
        } else {
          renderError(`Unknown theme: ${args}. Available: ${listThemes().join(', ')}`);
        }
        return true;
      }

      case 'model':
        if (!args) {
          renderLine(chalk.dim(`Current model: ${currentModel}`));
          return true;
        }
        currentModel = args.trim();
        agent = null; // Force re-creation with new model
        renderLine(chalk.dim(`Model set to: ${currentModel} (will resolve on next message)`));
        return true;

      case 'sessions': {
        const sessions = await listSessions(cwd);
        if (sessions.length === 0) {
          renderLine(chalk.dim('No sessions.'));
        } else {
          for (const id of sessions) {
            renderLine(`  ${id}`);
          }
        }
        return true;
      }

      case 'help':
        printHelp();
        return true;

      case 'exit':
      case 'quit':
        if (agent) {
          await saveSession(agent.session);
          console.log(chalk.dim(`Session saved: ${agent.session.id}`));
        }
        input.close();
        process.exit(0);

      // --- Commands that NEED the agent/API key ---
      case 'btw': {
        if (!args) {
          renderError('/btw requires a question');
          return true;
        }
        const a = await getAgent();
        const { provider: p } = resolveProvider(currentModel);
        await btw(args, a.getMessages(), p, currentModel);
        return true;
      }

      case 'compact': {
        const a = await getAgent();
        const { provider: p } = resolveProvider(currentModel);
        await compact(a.session, p, currentModel, args || undefined);
        return true;
      }

      case 'context': {
        const a = await getAgent();
        showContext(a.getMessages(), currentModel);
        return true;
      }

      case 'branch': {
        const a = await getAgent();
        renderLine(chalk.dim(`Conversation branched at: ${a.session.currentBranch}`));
        return true;
      }

      case 'copy': {
        const a = await getAgent();
        copy(args, a.getMessages());
        return true;
      }

      case 'save': {
        const a = await getAgent();
        await saveSession(a.session);
        renderLine(chalk.dim(`Session saved: ${a.session.id}`));
        return true;
      }

      case 'team': {
        const { provider: p } = resolveProvider(currentModel);
        await handleTeamCommand(args, cwd, p, currentModel);
        return true;
      }

      default: {
        // Check skill triggers
        const skill = skills.findByTrigger(`/${name}`);
        if (skill) {
          const content = skills.activate(skill.name);
          if (content) {
            renderLine(chalk.dim(`Activated skill: ${skill.name}`));
            const a = await getAgent();
            const prompt = args ? `${content}\n\nUser request: ${args}` : content;
            await a.send(prompt);
            renderText('\n');
          } else {
            renderLine(chalk.dim(`Skill ${skill.name} already active.`));
            if (args) {
              const a = await getAgent();
              await a.send(args);
              renderText('\n');
            }
          }
          return true;
        }

        // Check extension commands (needs agent for extensions)
        if (agent) {
          const extCmd = agent.extensions.getCommand(name);
          if (extCmd) {
            await extCmd(args);
            return true;
          }
        }

        renderError(`Unknown command: /${name}`);
        return true;
      }
    }
  };

  // REPL loop
  while (true) {
    renderPrompt(opts.color);

    try {
      const line = await input.getLine('');
      const trimmed = line.trim();

      if (!trimmed) continue;

      // ! prefix: run bash command directly
      if (trimmed.startsWith('!')) {
        const cmd = trimmed.slice(1).trim();
        if (cmd) {
          try {
            const { execSync } = await import('node:child_process');
            const output = execSync(cmd, { cwd, encoding: 'utf-8', timeout: 30000 });
            if (output.trim()) {
              renderLine(chalk.dim(output.trimEnd()));
            }
            // Add to conversation context if agent exists
            if (agent !== null) {
              const { addEntry } = await import('@blush/core');
              addEntry(agent!.session, {
                role: 'user',
                content: `[Shell command: ${cmd}]\n${output}`,
              });
            }
          } catch (err) {
            const e = err as { stderr?: string; message?: string };
            renderError(e.stderr || e.message || 'Command failed');
          }
        }
        continue;
      }

      if (isCommand(trimmed)) {
        const { name, args } = parseCommand(trimmed);
        await handleCommand(name, args);
        continue;
      }

      // Send to agent (this triggers lazy init + API key check)
      try {
        const a = await getAgent();
        await a.send(trimmed);
        renderText('\n');

        // Show prompt suggestions (non-blocking)
        const { provider: p } = resolveProvider(currentModel);
        showSuggestions(a.getMessages(), p, currentModel).catch(() => {});

        // Auto-save
        await saveSession(a.session);
      } catch (err) {
        renderError((err as Error).message);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE') break;
      renderError((err as Error).message);
    }
  }
}
