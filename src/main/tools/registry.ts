import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
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
