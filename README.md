# AP

Team CLI agent from [ap.haus](https://ap.haus). Terminal coding agent where multi-agent coordination is core architecture, not an extension.

**Philosophy:** Pi's minimalism + Claude Code's best ideas + team-native from day 1.

## Install

```bash
git clone https://github.com/baahaus/ap.git
cd ap
pnpm install
pnpm build
```

Link the binary:

```bash
pnpm link --global packages/cli
```

Or run directly:

```bash
node packages/cli/dist/bin.js
```

## Setup

Set your API key via any of:

```bash
# Environment variable
export ANTHROPIC_API_KEY=sk-ant-...

# Config file
mkdir -p ~/.ap
echo '{"anthropic_api_key": "sk-ant-..."}' > ~/.ap/config.json

# .env file in project root
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env
```

## Usage

```bash
ap                          # Interactive mode
ap -p "question"            # Print mode (single response, exit)
ap -m claude-opus-4-20250514  # Use a specific model
ap -r                       # Resume last session
ap sessions                 # List sessions
```

## Commands

| Command | Description |
|---------|-------------|
| `/btw <question>` | Ephemeral question -- full context, no tools, no history pollution |
| `/compact [focus]` | Compress conversation with optional focus |
| `/branch` | Fork conversation at current point |
| `/context` | Visualize context window usage |
| `/model <name>` | Switch model mid-session |
| `/team spawn <name>` | Create a peer agent with its own worktree |
| `/team msg <name> <msg>` | Send message to an agent |
| `/team status` | Show all agents and tasks |
| `/team synthesize` | Combine all agent outputs |
| `/team merge <name>` | Merge agent's changes back |
| `/save` | Save session |
| `/help` | Show all commands |

## Architecture

5-package TypeScript monorepo:

```
@ap/ai     Multi-provider LLM (Anthropic, OpenAI, any OpenAI-compatible)
  |
@ap/core   Agent loop + 4 tools (read, write, edit, bash)
  |
@ap/tui    Terminal UI (streaming, overlays, syntax highlighting)
  |
@ap/cli    The `ap` binary (REPL, commands, sessions)
  |
@ap/team   Peer agents, git worktree isolation, mailbox, task queue
```

### Why 4 tools?

Pi.dev proved it: frontier models don't need 30 built-in tools. Four primitives (read, write, edit, bash) cover everything. The rest is extensions.

### Why team-native?

Most agent frameworks bolt on multi-agent as an afterthought. AP builds it into the core:

- **Peer agents** -- equals, not parent-child
- **Git worktree isolation** -- each agent gets a full repo copy on a temporary branch
- **File-based mailboxes** -- structured message passing between agents
- **Shared task queue** -- any agent can create, claim, or complete tasks
- **Consensus patterns** -- synthesis, vote, review, pipeline

### What we stole

From **pi.dev**: 4-tool core, layered packages, JSONL sessions, sub-1000-token system prompt.

From **Claude Code**: /btw (ephemeral questions), /compact, /branch, /context, prompt cache preservation, agent teams with worktree isolation.

## Context Files

AP reads instruction files hierarchically:

- `~/.ap/AGENTS.md` or `~/.ap/CLAUDE.md` -- global instructions
- `./AGENTS.md` or `./CLAUDE.md` -- per-project instructions
- `./SYSTEM.md` -- full system prompt override
- `./APPEND_SYSTEM.md` -- append to system prompt

## Extending

Extensions are TypeScript modules loaded from `~/.ap/extensions/` or `.ap/extensions/`:

```typescript
export default function activate(ap) {
  ap.tools.register({ name: 'my-tool', ... });
  ap.commands.register('/my-cmd', async (args) => { ... });
}
```

## License

MIT

## Links

- [ap.haus](https://ap.haus) -- Research org
- [PLAN.md](PLAN.md) -- Full architecture plan
- [baa.haus](https://baa.haus) -- Creator
