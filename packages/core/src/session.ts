import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import type { Message } from '@blush/ai';

const SESSIONS_DIR = join(homedir(), '.blush', 'sessions');

export interface SessionEntry {
  id: string;
  parentId: string | null;
  timestamp: number;
  message: Message;
  metadata?: Record<string, unknown>;
}

export interface Session {
  id: string;
  cwd: string;
  entries: SessionEntry[];
  currentBranch: string; // ID of the latest entry in the active branch
}

export interface SessionSummary {
  id: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  entryCount: number;
  activeMessageCount: number;
  title: string;
}

function encodeCwd(cwd: string): string {
  return createHash('sha256').update(cwd).digest('hex').slice(0, 16);
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function sessionDir(cwd: string): string {
  return join(SESSIONS_DIR, encodeCwd(cwd));
}

export async function createSession(cwd: string): Promise<Session> {
  const id = generateId();
  const dir = sessionDir(cwd);
  await mkdir(dir, { recursive: true });

  const session: Session = {
    id,
    cwd,
    entries: [],
    currentBranch: '',
  };

  return session;
}

export function addEntry(
  session: Session,
  message: Message,
  metadata?: Record<string, unknown>,
): SessionEntry {
  const entry: SessionEntry = {
    id: generateId(),
    parentId: session.currentBranch || null,
    timestamp: Date.now(),
    message,
    metadata,
  };

  session.entries.push(entry);
  session.currentBranch = entry.id;
  return entry;
}

export function getActiveMessages(session: Session): Message[] {
  if (session.entries.length === 0) return [];

  // Walk back from currentBranch to build the active chain
  const chain: SessionEntry[] = [];
  let currentId: string | null = session.currentBranch;

  const entriesById = new Map(session.entries.map((e) => [e.id, e]));

  while (currentId) {
    const entry = entriesById.get(currentId);
    if (!entry) break;
    chain.unshift(entry);
    currentId = entry.parentId;
  }

  return chain.map((e) => e.message);
}

export function branchAt(session: Session, entryId: string): void {
  // Set currentBranch to the given entry, future entries fork from here
  const entry = session.entries.find((e) => e.id === entryId);
  if (!entry) throw new Error(`Entry not found: ${entryId}`);
  session.currentBranch = entryId;
}

export async function saveSession(session: Session): Promise<void> {
  const dir = sessionDir(session.cwd);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${session.id}.jsonl`);

  const lines = session.entries.map((e) => JSON.stringify(e)).join('\n');
  await writeFile(path, lines + '\n', 'utf-8');
}

export async function loadSession(cwd: string, sessionId: string): Promise<Session | null> {
  const dir = sessionDir(cwd);
  const path = join(dir, `${sessionId}.jsonl`);

  if (!existsSync(path)) return null;

  const content = await readFile(path, 'utf-8');
  const entries: SessionEntry[] = content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const lastEntry = entries[entries.length - 1];

  return {
    id: sessionId,
    cwd,
    entries,
    currentBranch: lastEntry?.id || '',
  };
}

export async function listSessions(cwd: string): Promise<string[]> {
  const summaries = await listSessionSummaries(cwd);
  return summaries.map((summary) => summary.id);
}

function getMessageText(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content.trim();
  }

  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeSession(session: Session): SessionSummary {
  const activeMessages = getActiveMessages(session);
  const firstEntry = session.entries[0];
  const lastEntry = session.entries[session.entries.length - 1];
  const firstUserMessage = activeMessages.find((message) => message.role === 'user');
  const rawTitle = firstUserMessage ? getMessageText(firstUserMessage) : '';
  const title = rawTitle
    ? rawTitle.slice(0, 72)
    : 'Untitled session';

  return {
    id: session.id,
    cwd: session.cwd,
    createdAt: firstEntry?.timestamp ?? 0,
    updatedAt: lastEntry?.timestamp ?? 0,
    entryCount: session.entries.length,
    activeMessageCount: activeMessages.length,
    title,
  };
}

export async function listSessionSummaries(cwd: string): Promise<SessionSummary[]> {
  const dir = sessionDir(cwd);
  if (!existsSync(dir)) return [];

  const { readdir } = await import('node:fs/promises');
  const files = await readdir(dir);
  const sessionIds = files
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace('.jsonl', ''));

  const loaded = await Promise.all(sessionIds.map((sessionId) => loadSession(cwd, sessionId)));
  return loaded
    .filter((session): session is Session => Boolean(session))
    .map((session) => summarizeSession(session))
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}
