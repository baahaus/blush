import { Type, type Static } from '@sinclair/typebox';

const TodoItem = Type.Object({
  content: Type.String({ description: 'The todo text' }),
  status: Type.Union([
    Type.Literal('pending'),
    Type.Literal('in_progress'),
    Type.Literal('completed'),
  ]),
  activeForm: Type.Optional(Type.String({ description: 'Optional present-tense phrasing for in-progress display' })),
});

export const TodoParams = Type.Object({
  operation: Type.Optional(Type.Union([
    Type.Literal('read'),
    Type.Literal('write'),
    Type.Literal('clear'),
  ], { default: 'read' })),
  todos: Type.Optional(Type.Array(TodoItem, { description: 'Todo items to persist for this workspace' })),
});

export type TodoParams = Static<typeof TodoParams>;
export type TodoEntry = Static<typeof TodoItem>;

const todoState = new Map<string, TodoEntry[]>();

function formatTodos(todos: TodoEntry[]): string {
  if (todos.length === 0) {
    return 'Todo list is empty.';
  }

  return [
    `Todo list (${todos.length} item${todos.length === 1 ? '' : 's'}):`,
    ...todos.map((todo, index) => {
      const suffix = todo.activeForm ? ` (${todo.activeForm})` : '';
      return `${index + 1}. [${todo.status}] ${todo.content}${suffix}`;
    }),
  ].join('\n');
}

export async function todo(params: TodoParams): Promise<string> {
  const { operation = 'read', todos = [] } = params;
  const key = process.cwd();

  if (operation === 'clear') {
    todoState.delete(key);
    return 'Todo list cleared.';
  }

  if (operation === 'write') {
    const inProgress = todos.filter((item) => item.status === 'in_progress');
    if (inProgress.length > 1) {
      return 'Error: Only one todo may be in_progress at a time.';
    }

    todoState.set(key, todos);
    return formatTodos(todos);
  }

  return formatTodos(todoState.get(key) || []);
}

export const todoTool = {
  name: 'todo',
  description: 'Read or update the structured todo list for the current workspace session.',
  input_schema: TodoParams,
  execute: todo,
};
