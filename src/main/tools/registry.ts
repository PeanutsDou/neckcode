import { promises as fs, existsSync, statSync } from 'fs';
import { dirname, resolve, join, relative, extname } from 'path';
import { exec as execCb, execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import type { ToolDefinition, ToolCall } from '../agent/types';
import type { ToolRegistry } from '../agent/runtime';

const exec = promisify(execCb);
const execFile = promisify(execFileCb);

function ensurePath(workspaceRoot: string, inputPath?: string): string {
  const p = typeof inputPath === 'string' && inputPath.trim() ? inputPath.trim() : '.';
  const resolved = resolve(workspaceRoot, p);
  const normalizedRoot = resolve(workspaceRoot);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + '\\') && !resolved.startsWith(normalizedRoot + '/')) {
    throw new Error(`Path escapes workspace root: ${p}`);
  }
  return resolved;
}

function truncate(text: string, maxLen = 12000): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}\n...[truncated ${text.length - maxLen} chars]`;
}

function safeJson(input: string): Record<string, unknown> {
  if (!input) return {};
  return JSON.parse(input);
}

const DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 text file from the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to the file.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write a UTF-8 text file inside the workspace. Creates parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path.' },
          content: { type: 'string', description: 'Complete file content.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and folders inside the workspace directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path. Defaults to workspace root.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file inside the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_shell',
      description: 'Run a shell command inside the workspace root.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute.' },
        },
        required: ['command'],
      },
    },
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
  },
];

export function createToolRegistry(workspaceRoot: string): ToolRegistry {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
    async read_file(args) {
      const p = ensurePath(workspaceRoot, args.path as string);
      const content = await fs.readFile(p, 'utf8');
      return truncate(content);
    },

    async write_file(args) {
      const p = ensurePath(workspaceRoot, args.path as string);
      await fs.mkdir(dirname(p), { recursive: true });
      const content = String(args.content);
      await fs.writeFile(p, content, 'utf8');
      return `Wrote ${content.length} chars to ${p}`;
    },

    async list_dir(args) {
      const p = ensurePath(workspaceRoot, args.path as string);
      const entries = await fs.readdir(p, { withFileTypes: true });
      const lines = entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(e => `${e.isDirectory() ? '[dir]' : '[file]'} ${e.name}`);
      return lines.length ? lines.join('\n') : '[empty]';
    },

    async delete_file(args) {
      const p = ensurePath(workspaceRoot, args.path as string);
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
      const p = ensurePath(workspaceRoot, args.path as string);
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

      return `Replaced in ${p} (line ${changedLine})`;
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
      const p = ensurePath(workspaceRoot, searchPath);

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
      return `${summary}\n${truncate(output, 8000)}`;
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
        return await handler(args);
      } catch (err) {
        return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}
