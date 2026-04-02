import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const originalHome = process.env.HOME;

async function loadSessionModule() {
  vi.resetModules();
  return import('./session.js');
}

describe('session summaries', () => {
  let tempHome: string | null = null;

  afterEach(async () => {
    if (tempHome) {
      await rm(tempHome, { recursive: true, force: true });
      tempHome = null;
    }

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  it('sorts sessions by most recent activity and derives titles', async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'blush-session-test-'));
    process.env.HOME = tempHome;

    const {
      createSession,
      addEntry,
      saveSession,
      listSessions,
      listSessionSummaries,
    } = await loadSessionModule();

    const cwd = '/tmp/blush-project';

    const older = await createSession(cwd);
    addEntry(older, { role: 'user', content: 'older session prompt' });
    addEntry(older, { role: 'assistant', content: 'older answer' });
    older.entries[0]!.timestamp = 1_000;
    older.entries[1]!.timestamp = 2_000;
    await saveSession(older);

    const newer = await createSession(cwd);
    addEntry(newer, { role: 'user', content: 'newer session prompt with more detail' });
    newer.entries[0]!.timestamp = 5_000;
    await saveSession(newer);

    const summaries = await listSessionSummaries(cwd);
    expect(summaries.map((summary) => summary.id)).toEqual([newer.id, older.id]);
    expect(summaries[0]).toMatchObject({
      title: 'newer session prompt with more detail',
      updatedAt: 5_000,
      entryCount: 1,
      activeMessageCount: 1,
    });
    expect(summaries[1]).toMatchObject({
      title: 'older session prompt',
      updatedAt: 2_000,
      entryCount: 2,
      activeMessageCount: 2,
    });

    expect(await listSessions(cwd)).toEqual([newer.id, older.id]);
  });
});
