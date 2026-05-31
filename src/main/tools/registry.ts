import { promises as fs, existsSync } from 'fs';
import { dirname, resolve, join, relative, extname, isAbsolute } from 'path';
import { exec as execCb, execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import type { ToolDefinition, ToolCall } from '../agent/types';
import type { ToolRegistry, ToolRunContext } from '../agent/runtime';
import type { ConfirmRequest, RiskLevel } from '../../shared/types';
import { webFetch } from './web-fetch';
import { webSearch } from './web-search';
import { taskHandlers } from './task-tools';
import { notebookEdit } from './notebook-edit';
import { skillHandlers } from './skill-tools';
import { getAgents } from '../config';
import type { AgentConfig } from '../../shared/types';
import { PLAN_MODE_TOOLS, planModeHandlers, filterPlanModeTools, isPlanMode } from '../plan-mode';
import { LSP_TOOL_DEFINITIONS, createLspToolHandlers } from '../lsp/lsp-tools';

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

function isHighRiskShell(command: string): boolean {
  return /\b(rm|del|rmdir)\b/i.test(command)
    || /\bgit\s+(reset|clean)\b/i.test(command)
    || /invoke-webrequest[\s\S]*\|\s*iex/i.test(command)
    || /\b(curl|wget)\b[\s\S]*\|\s*(sh|bash|powershell|pwsh|iex)\b/i.test(command);
}

function riskForTool(toolName: string, args: Record<string, unknown>): RiskLevel {
  if (toolName === 'delete_file') return 'high';
  if (toolName === 'run_shell') return isHighRiskShell(String(args.command || '')) ? 'high' : 'medium';
  if (toolName === 'write_file' || toolName === 'edit_file' || toolName === 'notebook_edit') return 'medium';
  return 'low';
}

function describeToolAction(toolName: string, args: Record<string, unknown>, workspaceRoot: string): ConfirmRequest {
  const paths = [args.path, args.notebook_path, args.notebookPath]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  const command = toolName === 'run_shell' ? String(args.command || '') : undefined;
  const warnings: string[] = [];
  if (toolName === 'delete_file') warnings.push('该操作会删除文件。');
  if (command && isHighRiskShell(command)) warnings.push('命令包含删除、重置、远程脚本执行等高风险片段。');

  if (toolName === 'run_shell') {
    return {
      toolName,
      riskLevel: riskForTool(toolName, args),
      summary: `运行命令：${String(args.command || '').slice(0, 500)}`,
      cwd: workspaceRoot,
      command,
      warnings,
      rawArgs: args,
    };
  }
  if (toolName === 'delete_file') {
    return { toolName, riskLevel: 'high', summary: `删除文件：${String(args.path || '')}`, cwd: workspaceRoot, paths, warnings, rawArgs: args };
  }
  if (toolName === 'write_file') {
    return { toolName, riskLevel: 'medium', summary: `写入文件：${String(args.path || '')}`, cwd: workspaceRoot, paths, warnings, rawArgs: args };
  }
  if (toolName === 'edit_file') {
    return { toolName, riskLevel: 'medium', summary: `编辑文件：${String(args.path || '')}`, cwd: workspaceRoot, paths, warnings, rawArgs: args };
  }
  if (toolName === 'notebook_edit') {
    return { toolName, riskLevel: 'medium', summary: `编辑 Notebook：${String(args.notebook_path || args.path || args.notebookPath || '')}`, cwd: workspaceRoot, paths, warnings, rawArgs: args };
  }
  return { toolName, riskLevel: 'low', summary: `执行工具：${toolName}`, cwd: workspaceRoot, paths, warnings, rawArgs: args };
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
      description: 'Read a UTF-8 text file. Use this to verify actual source before explaining or editing. Prefer reading the smallest relevant files or ranges of files discovered by grep/glob/list_dir. Default permission restricts paths to the workspace; full access allows absolute local paths.',
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
      description: 'Write a complete UTF-8 file. Use only when creating a new file or replacing a whole file is simpler and safer than targeted edits. Keep generated code plain, minimal, and maintainable. Default permission restricts paths to the workspace and asks for confirmation; full access allows absolute local paths without confirmation.',
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
      description: 'List files and folders to understand real project structure before choosing files to read or edit. Use this early when the relevant paths are uncertain. Default permission restricts paths to the workspace; full access allows absolute local paths.',
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
      description: 'Delete a file. Use only when deletion is explicitly needed and supported by investigation; avoid deleting generated or user files speculatively. Default permission restricts paths to the workspace and asks for confirmation; full access allows absolute local paths without confirmation.',
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
      description: 'Run a shell command from the workspace root. Prefer read-only diagnostic commands first (typecheck, tests, git status, directory inspection). Avoid destructive commands unless explicitly required and confirmed. If a command fails, inspect the output and change strategy instead of repeating it. Default permission asks for confirmation; full access runs without confirmation.',
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
      description: 'Make a targeted exact string replacement in an existing file. Use this for minimal, maintainable edits after reading the actual file. The old_string must uniquely match the text to replace; include enough surrounding context to avoid accidental edits.',
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
      description: 'Find files matching a glob pattern. Use this to locate candidate files before reading or editing. Supports *, **, ?, [abc] patterns.',
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
      description: 'Search actual project text with a regex. Use this before making claims about APIs, symbols, components, config keys, or call sites. Returns matching lines with file paths and line numbers.',
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
      name: 'everything_search',
      description: 'Search local Windows files and directories using Everything. Use this for fast whole-disk filename/path searches when the needed file, folder, project, document, or asset may be outside the workspace. Separate multiple keywords with spaces.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Everything search query. Use concise filename, folder, extension, or path keywords.' },
        },
        required: ['query'],
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
      description: 'Create a new task. Use this to break complex work into small, trackable steps when the work has multiple dependent parts. Keep task descriptions concrete and evidence-based.',
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
      description: 'Load a SKILL.md skill into the conversation. Call this when a loaded skill is clearly relevant to the task; do not invoke unrelated skills speculatively.',
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
      description: 'Ask the user one or more questions only when the answer cannot be discovered by inspecting the project and a wrong assumption would materially affect the result. Each question can have multiple options.',
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
  {
    type: 'function',
    function: {
      name: 'invoke_agent',
      description: '调用已配置的专属 Agent 执行任务。适合把明确、独立、可验证的子任务交给专门 Agent；任务描述必须包含目标、相关文件/证据、约束和期望输出。可并行调用多个 Agent，每个子 Agent 拥有独立上下文。',
      parameters: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: '要调用的 Agent 名称或 ID。' },
          task: { type: 'string', description: '任务描述，将作为子 Agent 的初始用户消息注入到独立上下文中。' },
        },
        required: ['agent', 'task'],
      },
    },
    readOnly: true,
  },
  ...PLAN_MODE_TOOLS,
  ...LSP_TOOL_DEFINITIONS,
];

import type { PermissionMode } from '../../shared/permissions';

/** Callback type for external tool injection (e.g. MCP). */
export type ExternalToolsProvider = () => ToolDefinition[];
export type McpToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

const CONFIRM_TOOLS = new Set(['write_file', 'edit_file', 'delete_file', 'run_shell', 'notebook_edit']);
const PLAN_MODE_BLOCKED_TOOLS = new Set(['write_file', 'edit_file', 'delete_file', 'run_shell', 'notebook_edit']);

const TOOL_SEARCH_DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'tool_search',
    description: 'Search deferred external tools and make selected tool schemas available on the next model step. Use this when an integration/MCP capability may exist but is not in the current tool list. Query by server, action, or tool name; use select:<tool_name> for direct selection.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms, or select:<exact_tool_name>.' },
        max_results: { type: 'number', description: 'Maximum result count. Default 5.' },
      },
      required: ['query'],
    },
  },
  readOnly: true,
};

function searchToolDefinitions(query: string, tools: ToolDefinition[], maxResults: number): ToolDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  if (normalized.startsWith('select:')) {
    const wanted = normalized.slice('select:'.length).trim();
    return tools.filter(tool => tool.function.name.toLowerCase() === wanted).slice(0, 1);
  }
  const terms = normalized.split(/\s+/).filter(Boolean);
  const scored = tools.map(tool => {
    const haystack = `${tool.function.name} ${tool.function.description}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (tool.function.name.toLowerCase() === term) score += 20;
      if (tool.function.name.toLowerCase().includes(term)) score += 8;
      if (haystack.includes(term)) score += 3;
    }
    return { tool, score };
  }).filter(item => item.score > 0);
  scored.sort((a, b) => b.score - a.score || a.tool.function.name.localeCompare(b.tool.function.name));
  return scored.slice(0, maxResults).map(item => item.tool);
}

function buildInvokeAgentDefinition(definition: ToolDefinition, agents: AgentConfig[]): ToolDefinition {
  const parameterSchema = definition.function.parameters as {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const choices = Array.from(new Set(
    agents.flatMap(agent => [agent.name.trim(), agent.id.trim()]).filter(Boolean)
  ));
  const summary = agents
    .map(agent => {
      const title = agent.name.trim() || agent.id;
      const skills = agent.skills.length > 0 ? `; skills: ${agent.skills.join(', ')}` : '';
      return `${title} [id: ${agent.id}; model: ${agent.model}${skills}]`;
    })
    .join(' | ');

  return {
    ...definition,
    function: {
      ...definition.function,
      description: summary
        ? `Delegate work to a configured specialist agent when it is a better fit or when an isolated subtask should be handed off. Current user-turn image attachments are forwarded automatically to the sub-agent. Available agents: ${summary}`
        : definition.function.description,
      parameters: {
        ...parameterSchema,
        properties: {
          ...(parameterSchema.properties || {}),
          agent: {
            ...((parameterSchema.properties?.agent as Record<string, unknown> | undefined) || {}),
            ...(choices.length > 0 ? { enum: choices } : {}),
            description: choices.length > 0
              ? `Agent name or ID. Available values: ${choices.join(', ')}.`
              : 'Agent name or ID.',
          },
          task: {
            ...((parameterSchema.properties?.task as Record<string, unknown> | undefined) || {}),
            description: 'Self-contained task for the sub-agent. Current user-turn image attachments are forwarded automatically when present.',
          },
        },
      },
    },
    readOnly: false,
  };
}

export function createToolRegistry(
  workspaceRoot: string,
  confirmHandler?: (request: ConfirmRequest) => Promise<boolean>,
  askHandler?: (questions: Array<{ question: string; header: string; options: Array<{ label: string; description: string }>; multiSelect?: boolean }>) => Promise<Record<string, string>>,
  getPermissionMode?: () => PermissionMode,
  invokeAgent?: (args: Record<string, unknown>, context?: ToolRunContext | null) => Promise<string>,
  getExternalTools?: ExternalToolsProvider,
  executeExternalTool?: McpToolExecutor,
): ToolRegistry {
  let currentRunContext: ToolRunContext | null = null;
  const selectedDeferredTools = new Set<string>();
  const needsConfirm = (toolName: string, args: Record<string, unknown>): boolean => {
    const mode = getPermissionMode?.() || 'default';
    void args;
    return mode === 'default' && CONFIRM_TOOLS.has(toolName);
  };

  const canAccessAllPaths = () => (getPermissionMode?.() || 'default') === 'fullAccess';
  const resolveToolPath = (inputPath?: string) => ensurePath(workspaceRoot, inputPath, canAccessAllPaths());

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
    ...createLspToolHandlers(workspaceRoot),

    async tool_search(args) {
      const query = String(args.query || '');
      const maxResults = Math.max(1, Math.min(20, Number(args.max_results || 5)));
      const deferred = getExternalTools?.() || [];
      const matches = searchToolDefinitions(query, deferred, maxResults);
      for (const match of matches) selectedDeferredTools.add(match.function.name);
      return JSON.stringify({
        query,
        matches: matches.map(match => ({
          name: match.function.name,
          description: match.function.description,
          selected: true,
        })),
        total_deferred_tools: deferred.length,
        note: matches.length > 0
          ? 'Selected tool schemas will be available on the next model step.'
          : 'No matching deferred tools found.',
      }, null, 2);
    },

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


    async everything_search(args) {
      const query = String(args.query || '');
      if (!query.trim()) return 'ERROR: query is required';
      try {
        const { everythingSearch, isEverythingAvailable, initEverything } = require('../quick-launcher/everything');
        if (!isEverythingAvailable()) await initEverything();
        if (!isEverythingAvailable()) return 'Everything SDK is not available (non-NTFS volume or service not running)';
        const results = await everythingSearch(query.trim(), 30);
        if (results.length === 0) return 'No files or directories matched the search query.';
        return JSON.stringify(results.map((r: any) => ({
          name: r.name, path: r.fullPath, type: r.isFolder ? 'directory' : 'file',
          size: r.size, modified: r.modified?.toISOString(),
        })), null, 2);
      } catch (err) {
        return 'ERROR: Everything search failed: ' + (err instanceof Error ? err.message : String(err));
      }
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

    async invoke_agent(args) {
      if (!invokeAgent) return 'ERROR: invoke_agent is not available.';
      return await invokeAgent(args, currentRunContext);
    },

    // Plan mode handlers
    async enter_plan_mode(args) { return planModeHandlers.enter_plan_mode(args); },
    async exit_plan_mode(args) { return planModeHandlers.exit_plan_mode(args); },

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
      const agents = getAgents().filter(agent => (agent.name.trim() || agent.id.trim()) && agent.model.trim());
      const builtins = [...DEFINITIONS, TOOL_SEARCH_DEFINITION]
        .filter(def => {
          if (def.function.name === 'ask_user_question' && !askHandler) return false;
          if (def.function.name === 'invoke_agent' && (!invokeAgent || agents.length === 0)) return false;
          return true;
        })
        .map(def => def.function.name === 'invoke_agent' ? buildInvokeAgentDefinition(def, agents) : def);
      const externals = (getExternalTools?.() || [])
        .filter(tool => selectedDeferredTools.has(tool.function.name));
      const allTools = [...builtins, ...externals];
      return filterPlanModeTools(allTools);
    },

    setRunContext(context) {
      currentRunContext = context;
    },

    async execute(toolCall: ToolCall): Promise<string> {
      const mode = getPermissionMode?.() || 'default';
      const inPlanMode = mode === 'plan' || isPlanMode();

      if (inPlanMode) {
        if (toolCall.name.startsWith('mcp__')) {
          return `ERROR: Plan mode is read-only and blocks external MCP tool execution: ${toolCall.name}`;
        }
        if (PLAN_MODE_BLOCKED_TOOLS.has(toolCall.name)) {
          return `ERROR: Plan mode is read-only and blocks tool execution: ${toolCall.name}`;
        }
      }

      // Route mcp__* tools to external executor
      if (toolCall.name.startsWith('mcp__') && executeExternalTool) {
        try {
          const args = safeJson(toolCall.argumentsText);
          return await executeExternalTool(toolCall.name, args);
        } catch (err) {
          return `ERROR: MCP tool ${toolCall.name}: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      const handler = handlers[toolCall.name];
      if (!handler) {
        return `ERROR: Unknown tool "${toolCall.name}"`;
      }
      try {
        const args = safeJson(toolCall.argumentsText);

        if (mode === 'default' && toolCall.name === 'run_shell' && commandEscapesWorkspace(String(args.command || ''), workspaceRoot)) {
          return 'ERROR: 默认权限下命令只能在工作区内工作。切换到“完全访问”后才能引用工作区外路径。';
        }

        if (confirmHandler && needsConfirm(toolCall.name, args)) {
          const desc = describeToolAction(toolCall.name, args, workspaceRoot);
          const approved = await confirmHandler(desc);
          if (!approved) {
            return `Operation cancelled by user: ${desc.summary}`;
          }
        }

        const result = await handler(args);
        return result;
      } catch (err) {
        return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}
