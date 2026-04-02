import chalk from 'chalk';
import { getTheme, renderLine, sym } from '@blush/tui';

export interface SelectableModel {
  name: string;
  provider: string;
}

const selectableModels: SelectableModel[] = [
  { name: 'gpt-5.4', provider: 'Codex' },
  { name: 'gpt-5.4-mini', provider: 'Codex' },
  { name: 'claude-sonnet-4-6-20250610', provider: 'Anthropic' },
  { name: 'claude-sonnet-4-20250514', provider: 'Anthropic' },
  { name: 'claude-opus-4-6-20250610', provider: 'Anthropic' },
  { name: 'claude-haiku-4-5-20251001', provider: 'Anthropic' },
  { name: 'gpt-4o', provider: 'OpenAI' },
  { name: 'gpt-4o-mini', provider: 'OpenAI' },
  { name: 'o3-mini', provider: 'OpenAI' },
  { name: 'o1', provider: 'OpenAI' },
  { name: 'o1-mini', provider: 'OpenAI' },
  { name: 'gpt-5.3-codex', provider: 'Codex' },
  { name: 'gpt-5.2-codex', provider: 'Codex' },
  { name: 'gpt-5.2', provider: 'Codex' },
  { name: 'gpt-5.1-codex', provider: 'Codex' },
  { name: 'gpt-5.1', provider: 'Codex' },
  { name: 'gpt-5-codex', provider: 'Codex' },
  { name: 'gpt-5', provider: 'Codex' },
];

export function listSelectableModels(): SelectableModel[] {
  return selectableModels;
}

export function resolveModelSelection(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed) - 1;
    return selectableModels[index]?.name || null;
  }

  const exact = selectableModels.find((model) => model.name === trimmed);
  if (exact) return exact.name;

  const caseInsensitive = selectableModels.find((model) => model.name.toLowerCase() === trimmed.toLowerCase());
  return caseInsensitive?.name || null;
}

export function showModelSelector(currentModel: string): void {
  const theme = getTheme();

  renderLine('');
  renderLine(chalk.hex(theme.text).bold('  Models'));
  renderLine('');

  let previousProvider = '';
  for (const [index, model] of selectableModels.entries()) {
    if (model.provider !== previousProvider) {
      if (previousProvider) renderLine('');
      renderLine(`  ${chalk.hex(theme.muted)(model.provider.toUpperCase())}`);
      previousProvider = model.provider;
    }

    const isCurrent = model.name === currentModel;
    const marker = isCurrent
      ? chalk.hex(theme.prompt)(sym.prompt)
      : chalk.hex(theme.muted)(String(index + 1).padStart(2, ' '));
    const current = isCurrent ? chalk.hex(theme.prompt)(' current') : '';
    renderLine(`  ${marker} ${chalk.hex(theme.text)(model.name)} ${chalk.hex(theme.dim)(model.provider)}${current}`);
  }

  renderLine('');
  renderLine(`  ${chalk.hex(theme.muted)('Tip: type any explicit model string or provider:model value.')}`);
  renderLine('');
}
