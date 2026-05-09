import { promises as fs, existsSync, statSync } from 'fs';
import { dirname, resolve, join, relative, extname, isAbsolute } from 'path';
import { exec as execCb, execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import type { ToolDefinition, ToolCall } from '../agent/types';
import type { ToolRegistry } from '../agent/runtime';
import { webFetch } from './web-fetch';
import { webSearch } from './web-search';
import { taskHandlers } from './task-tools';
import { notebookEdit } from './notebook-edit';
import { skillHandlers } from './skill-tools';

const exec = promisify(execCb);
const execFile = promisify(execFileCb);

function ensurePath(workspaceRoot: string, inputPath?: string, allowOutsideWorkspace = false): string {
  const p = typeof inputPath === 'string' && inputPath.trim() ? inputPath.trim() : '.';
  const resolved = allowOutsideWorkspace && isAbsolute(p) ? resolve(p) : resolve(workspaceRoot, p);
  const normalizedRoot = resolve(workspaceRoot);
  if (!allowOutsideWorkspace && resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + '\\') && !resolved.startsWith(normalizedRoot + '/')) {
    throw new Error(`Path escapes workspace root: ${p}`);
  }
  return resolved;
}

function truncate(text: string, maxLen = 200000): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}\n...[truncated ${text.length - maxLen} chars]`;
}

function safeJson(input: string): Record<string, unknown> {
  if (!input) return {};
  return JSON.parse(input);
}

function describeToolAction(toolName: string, args: Record<string, unknown>): string {
  if (toolName === 'run_shell') {
    return `运行命令：${String(args.command || '').slice(0, 500)}`;
  }
  if (toolName === 'delete_file') {
    return `删除文件：${String(args.path || '')}`;
  }
  if (toolName === 'write_file') {
    return `写入文件：${String(args.path || '')}`;
  }
  if (toolName === 'edit_file') {
    return `编辑文件：${String(args.path || '')}`;
  }
  if (toolName === 'notebook_edit') {
    return `编辑 Notebook：${String(args.path || args.notebookPath || '')}`;
  }
  return `执行工具：${toolName}`;
}

function commandEscapesWorkspace(command: string, workspaceRoot: string): boolean {
  const normalizedRoot = resolve(workspaceRoot).toLowerCase();
  if (/(^|[\s"'`])\.\.(\\|\/)/.test(command)) return true;

  const absolutePathPattern = /[a-zA-Z]:[\\/][^\s"'`|<>]+|\\\\[^\s"'`|<>]+/g;
  const matches = command.match(absolutePathPattern) || [];
  return matches.some(match => {
    const resolved = resolve(match).toLowerCase();
    return resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + '\\') && !resolved.startsWith(normalizedRoot + '/');
  });
}

const DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 text file. Default permission restricts paths to the workspace; full access allows absolute local paths.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to the file.' },
        },
        required: ['path'],
      },
    },
    readOnly: true,
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write a UTF-8 text file. Default permission restricts paths to the workspace and asks for confirmation; full access allows absolute local paths without confirmation.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path.' },
          content: { type: 'string', description: 'Complete file content.' },
        },
        required: ['path', 'content'],
      },
    },
    readOnly: false,
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and folders. Default permission restricts paths to the workspace; full access allows absolute local paths.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path. Defaults to workspace root.' },
        },
      },
    },
    readOnly: true,
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file. Default permission restricts paths to the workspace and asks for confirmation; full access allows absolute local paths without confirmation.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path.' },
        },
        required: ['path'],
      },
    },
    readOnly: false,
  },
  {
    type: 'function',
    function: {
      name: 'run_shell',
      description: 'Run a shell command. Default permission asks for confirmation and runs from the workspace root; full access runs without confirmation.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute.' },
        },
        required: ['command'],
      },
    },
    readOnly: false,
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Make exact string replacements in an existing file. The old_string must uniquely match the text to replace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to the file.' },
          old_string: { type: 'string', description: 'The exact text to replace.' },
          new_string: { type: 'string', description: 'The replacement text.' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
    readOnly: false,
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: 'Find files matching a glob pattern. Supports *, **, ?, [abc] patterns.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern, e.g. "**/*.ts" or "src/**/*.tsx".' },
        },
        required: ['pattern'],
      },
    },
    readOnly: true,
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search for a regex pattern in files. Returns matching lines with file paths and line numbers.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regular expression pattern to search for.' },
          path: { type: 'string', description: 'Directory or file to search in. Defaults to workspace root.' },
          include: { type: 'string', description: 'File pattern to include, e.g. "*.ts" or "*.{js,ts}".' },
        },
        required: ['pattern'],
      },
    },
    readOnly: true,
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch content from a URL and extract text. Only http/https URLs are allowed. Internal/private network addresses are blocked. Results are cached for 15 minutes.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch. Must be http or https.' },
        },
        required: ['url'],
      },
    },
    readOnly: true,
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web using DuckDuckGo. Returns titles, URLs, and snippets for up to 10 results.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query.' },
        },
        required: ['query'],
      },
    },
    readOnly: true,
  },
  {
    type: 'function',
    function: {
      name: 'task_create',
      description: 'Create a new task. Returns the task with a unique ID. Use this to break complex work into trackable steps.',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Brief title for the task.' },
          description: { type: 'string', description: 'What needs to be done.' },
          activeForm: { type: 'string', description: 'Present continuous tense form, e.g. "Running tests". Shown in UI while in progress.' },
        },
        required: ['subject', 'description'],
      },
    },
    readOnly: false,
  },
  {
    type: 'function',
    function: {
      name: 'task_get',
      description: 'Retrieve a task by its ID. Returns full task details including dependencies.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID to retrieve.' },
        },
        required: ['taskId'],
      },
    },
    readOnly: true,
  },
  {
    type: 'function',
    function: {
      name: 'task_list',
      description: 'List all tasks. Returns id, status, subject, and blockedBy for each task.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    readOnly: true,
  },
  {
    type: 'function',
    function: {
      name: 'task_update',
      description: 'Update a task. Can change status (pending/in_progress/completed), subject, description, and set up dependencies with addBlocks and addBlockedBy. A task cannot be started while blocked by incomplete tasks.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID to update.' },
          status: { type: 'string', description: 'New status: pending, in_progress, or completed.' },
          subject: { type: 'string', description: 'New title.' },
          description: { type: 'string', description: 'New description.' },
          addBlocks: { type: 'array', items: { type: 'string' }, description: 'Task IDs that this task blocks.' },
          addBlockedBy: { type: 'array', items: { type: 'string' }, description: 'Task IDs that block this task.' },
        },
        required: ['taskId'],
      },
    },
    readOnly: false,
  },
  {
    type: 'function',
    function: {
      name: 'notebook_edit',
      description: 'Edit a Jupyter notebook (.ipynb) at the cell level. Supports replace (default), insert, and delete modes.',
      parameters: {
        type: 'object',
        properties: {
          notebook_path: { type: 'string', description: 'Relative path to the .ipynb file.' },
          new_source: { type: 'string', description: 'New source content for the cell.' },
          cell_id: { type: 'string', description: 'Target cell ID. Defaults to the first cell.' },
          cell_type: { type: 'string', description: 'Cell type: "code" or "markdown".' },
          edit_mode: { type: 'string', description: 'Edit mode: "replace" (default), "insert", or "delete".' },
        },
        required: ['notebook_path', 'new_source'],
      },
    },
    readOnly: false,
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: 'List all available skills loaded from skills directories. Use this before invoke_skill if unsure which skill applies.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    readOnly: true,
  },
  {
    type: 'function',
    function: {
      name: 'invoke_skill',
      description: 'Load a SKILL.md skill into the conversation. Call this when a loaded skill is relevant to the task.',
      parameters: {
        type: 'object',
        properties: {
          skill: { type: 'string', description: 'Skill name, with or without a leading slash.' },
          args: { type: 'string', description: 'Optional arguments to pass into the skill.' },
        },
        required: ['skill'],
      },
    },
    readOnly: true,
  },
  {
    type: 'function',
    function: {
      name: 'ask_user_question',
      description: 'Ask the user one or more questions when you need clarification or decisions. Each question can have multiple options.',
      parameters: {
        type: 'object',
        properties: {
          questions: { type: 'array', items: { type: 'object' }, description: 'Array of questions to ask the user.' },
        },
        required: ['questions'],
      },
    },
    readOnly: true,
  },
];

import type { PermissionMode } from '../../shared/permissions';

const CONFIRM_TOOLS = new Set(['write_file', 'edit_file', 'delete_file', 'run_shell', 'notebook_edit']);

export function createToolRegistry(
  workspaceRoot: string,
  confirmHandler?: (message: string) => Promise<boolean>,
  askHandler?: (questions: Array<{ question: string; header: string; options: Array<{ label: string; description: string }>; multiSelect?: boolean }>) => Promise<Record<string, string>>,
  getPermissionMode?: () => PermissionMode,
): ToolRegistry {
  const needsConfirm = (toolName: string, args: Record<string, unknown>): boolean => {
    const mode = getPermissionMode?.() || 'default';
    void args;
    return mode === 'default' && CONFIRM_TOOLS.has(toolName);
  };

  const canAccessAllPaths = () => (getPermissionMode?.() || 'default') === 'fullAccess';
  const resolveToolPath = (inputPath?: string) => ensurePath(workspaceRoot, inputPath, canAccessAllPaths());

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
    async read_file(args) {
      const p = resolveToolPath(args.path as string);
      const content = await fs.readFile(p, 'utf8');
      return truncate(content);
    },

    async write_file(args) {
      const p = resolveToolPath(args.path as string);
      await fs.mkdir(dirname(p), { recursive: true });
      const content = String(args.content);
      await fs.writeFile(p, content, 'utf8');
      return `Wrote ${content.length} chars to ${p}`;
    },

    async list_dir(args) {
      const p = resolveToolPath(args.path as string);
      const entries = await fs.readdir(p, { withFileTypes: true });
      const lines = entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(e => `${e.isDirectory() ? '[dir]' : '[file]'} ${e.name}`);
      return lines.length ? lines.join('\n') : '[empty]';
    },

    async delete_file(args) {
      const p = resolveToolPath(args.path as string);
      await fs.unlink(p);
      return `Deleted ${p}`;
    },

    async run_shell(args) {
      const command = String(args.command);
      try {
        const result =
          process.platform === 'win32'
            ? await execFile('powershell.exe', ['-NoProfile', '-Command', command], {
                cwd: workspaceRoot,
                timeout: 60000,
                maxBuffer: 1024 * 1024,
              })
            : await exec(command, {
                cwd: workspaceRoot,
                timeout: 60000,
                maxBuffer: 1024 * 1024,
              });

        const stdout = (result.stdout || '').trim();
        const stderr = (result.stderr || '').trim();
        const merged = [stdout, stderr].filter(Boolean).join('\n');
        return truncate(merged || '[no output]');
      } catch (err) {
        const error = err as { message?: string; stdout?: string; stderr?: string };
        const out = [error.stdout, error.stderr].filter(Boolean).join('\n');
        const msg = error.message || String(err);
        return truncate(`ERROR: ${msg}${out ? `\n${out}` : ''}`);
      }
    },

    async edit_file(args) {
      const p = resolveToolPath(args.path as string);
      const oldStr = String(args.old_string);
      const newStr = String(args.new_string);

      const content = await fs.readFile(p, 'utf8');

      // Count occurrences to ensure uniqueness
      let count = 0;
      let idx = -1;
      while ((idx = content.indexOf(oldStr, idx + 1)) !== -1) {
        count++;
      }

      if (count === 0) {
        return `ERROR: old_string not found in ${p}. The exact text does not appear in the file.`;
      }

      if (count > 1) {
        return `ERROR: old_string appears ${count} times in ${p}. It must be unique. Add more surrounding context to make it unique.`;
      }

      const newContent = content.replace(oldStr, newStr);
      await fs.writeFile(p, newContent, 'utf8');

      const lines = content.split('\n');
      const newLines = newContent.split('\n');
      let changedLine = 0;
      for (let i = 0; i < lines.length && i < newLines.length; i++) {
        if (lines[i] !== newLines[i]) {
          changedLine = i + 1;
          break;
        }
      }

      // Return diff info for UI rendering
      const relPath = p.replace(/\\/g, '/');
      return JSON.stringify({
        status: 'modified',
        file: relPath,
        line: changedLine,
        old: oldStr.slice(0, 2000),
        new: newStr.slice(0, 2000),
      });
    },

    async glob(args) {
      const pattern = String(args.pattern);

      // Convert glob pattern to regex
      function globToRegex(glob: string): RegExp {
        let re = '';
        let i = 0;
        while (i < glob.length) {
          const c = glob[i];
          if (c === '*') {
            if (glob[i + 1] === '*') {
              // ** matches anything including slashes
              re += '.*';
              i += 2;
              // skip slash after **
              if (glob[i] === '/') i++;
              continue;
            }
            // * matches anything except slashes
            re += '[^/]*';
          } else if (c === '?') {
            re += '[^/]';
          } else if (c === '.') {
            re += '\\.';
          } else if (c === '[') {
            const close = glob.indexOf(']', i);
            if (close > i) {
              re += '[' + glob.slice(i + 1, close) + ']';
              i = close;
            } else {
              re += '\\[';
            }
          } else if ('\\+(){}^$|'.includes(c)) {
            re += '\\' + c;
          } else {
            re += c;
          }
          i++;
        }
        return new RegExp('^' + re + '$');
      }

      const regex = globToRegex(pattern);

      async function walk(dir: string, base: string): Promise<string[]> {
        const results: string[] = [];
        let entries;
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return results;
        }

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relPath = relative(base, fullPath).replace(/\\/g, '/');

          // Skip node_modules and .git
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;

          if (entry.isDirectory()) {
            results.push(...(await walk(fullPath, base)));
          } else if (regex.test(relPath)) {
            results.push(relPath);
          }
        }
        return results;
      }

      // Handle patterns starting with a specific directory
      const base = workspaceRoot;
      const results = await walk(base, base);

      if (results.length === 0) {
        return `No files matching "${pattern}"`;
      }

      const truncated = results.slice(0, 200);
      let output = truncated.join('\n');
      if (results.length > 200) {
        output += `\n...[${results.length - 200} more files]`;
      }
      return output;
    },

    async grep(args) {
      const pattern = String(args.pattern);
      const searchPath = typeof args.path === 'string' ? args.path : '.';
      const include = typeof args.include === 'string' ? args.include : null;
      const p = resolveToolPath(searchPath);

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, 'gi');
      } catch {
        return `ERROR: Invalid regex pattern: "${pattern}"`;
      }

      function matchesInclude(filename: string): boolean {
        if (!include) return true;
        // Convert include pattern like "*.ts" or "*.{ts,tsx}" to regex
        const incRegex = new RegExp(
          '^' + include.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\{([^}]+)\}/g, (_, alts) => '(' + alts.split(',').join('|') + ')') + '$'
        );
        return incRegex.test(filename);
      }

      const results: string[] = [];
      const MAX_RESULTS = 100;
      const MAX_LINE_LEN = 300;

      async function searchFile(filePath: string): Promise<void> {
        if (results.length >= MAX_RESULTS) return;
        let content: string;
        try {
          content = await fs.readFile(filePath, 'utf8');
        } catch {
          return;
        }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length && results.length < MAX_RESULTS; i++) {
          if (regex.test(lines[i])) {
            regex.lastIndex = 0; // Reset regex state
            const relPath = relative(workspaceRoot, filePath).replace(/\\/g, '/');
            const line = lines[i].length > MAX_LINE_LEN
              ? lines[i].slice(0, MAX_LINE_LEN) + '...'
              : lines[i];
            results.push(`${relPath}:${i + 1}: ${line}`);
          }
        }
      }

      async function walk(dir: string): Promise<void> {
        if (results.length >= MAX_RESULTS) return;
        let entries;
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (results.length >= MAX_RESULTS) return;
          const fullPath = join(dir, entry.name);
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (matchesInclude(entry.name)) {
            await searchFile(fullPath);
          }
        }
      }

      const stat = await fs.stat(p);
      if (stat.isFile()) {
        await searchFile(p);
      } else {
        await walk(p);
      }

      if (results.length === 0) {
        return `No matches for "${pattern}"`;
      }

      const output = results.join('\n');
      const summary = `Found ${results.length} match(es) for "${pattern}"`;
      return `${summary}\n${truncate(output, 80000)}`;
    },

    async web_fetch(args) {
      const url = String(args.url || '');
      return await webFetch(url);
    },

    async web_search(args) {
      const query = String(args.query || '');
      return await webSearch(query);
    },

    async task_create(args) {
      return taskHandlers.task_create(args);
    },

    async task_get(args) {
      return taskHandlers.task_get(args);
    },

    async task_list(args) {
      return taskHandlers.task_list(args);
    },

    async task_update(args) {
      return taskHandlers.task_update(args);
    },

    async notebook_edit(args) {
      return await notebookEdit(workspaceRoot, args);
    },

    async list_skills(args) {
      return skillHandlers.list_skills(args);
    },

    async invoke_skill(args) {
      return skillHandlers.invoke_skill(args);
    },

    async ask_user_question(args) {
      if (!askHandler) return 'ERROR: UI not available for questions.';

      const rawQuestions = args.questions;
      if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
        return 'ERROR: "questions" must be a non-empty array of question objects.';
      }

      const questions = rawQuestions.map((q: any) => ({
        question: String(q.question || ''),
        header: String(q.header || ''),
        options: Array.isArray(q.options) ? q.options.map((o: any) => ({
          label: String(o.label || ''),
          description: String(o.description || ''),
        })) : [],
        multiSelect: Boolean(q.multiSelect),
      }));

      try {
        const answers = await askHandler(questions);
        return JSON.stringify(answers, null, 2);
      } catch (err) {
        return `User question cancelled: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  return {
    getDefinitions() {
      return DEFINITIONS;
    },

    async execute(toolCall: ToolCall): Promise<string> {
      const handler = handlers[toolCall.name];
      if (!handler) {
        return `ERROR: Unknown tool "${toolCall.name}"`;
      }
      try {
        const args = safeJson(toolCall.argumentsText);
        const mode = getPermissionMode?.() || 'default';

        if (mode === 'default' && toolCall.name === 'run_shell' && commandEscapesWorkspace(String(args.command || ''), workspaceRoot)) {
          return 'ERROR: 默认权限下命令只能在工作区内工作。切换到“完全访问”后才能引用工作区外路径。';
        }

        if (confirmHandler && needsConfirm(toolCall.name, args)) {
          const desc = describeToolAction(toolCall.name, args);
          const approved = await confirmHandler(desc);
          if (!approved) {
            return `Operation cancelled by user: ${desc}`;
          }
        }

        return await handler(args);
      } catch (err) {
        return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}
