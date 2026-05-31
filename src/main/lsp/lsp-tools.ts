import { promises as fs } from 'fs';
import { execFile as execFileCb } from 'child_process';
import { extname, join, relative, resolve } from 'path';
import { pathToFileURL } from 'url';
import { promisify } from 'util';
import { DiagnosticSeverity } from 'vscode-languageserver-protocol';
import type { ToolDefinition } from '../agent/types';
import { sendLspRequest } from './manager';

const execFile = promisify(execFileCb);

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'release', 'out', 'build']);
const TEXT_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.css', '.scss', '.html', '.md',
  '.py', '.rs', '.go', '.java', '.cs', '.cpp', '.c', '.h',
]);

export const LSP_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'lsp',
      description: 'Run a real Language Server Protocol operation for a file position. Supports goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, prepareCallHierarchy, incomingCalls, and outgoingCalls when a language server is available.',
      parameters: {
        type: 'object',
        properties: {
          operation: { type: 'string', description: 'goToDefinition | findReferences | hover | documentSymbol | workspaceSymbol | goToImplementation | prepareCallHierarchy | incomingCalls | outgoingCalls' },
          filePath: { type: 'string', description: 'Relative file path in the workspace.' },
          line: { type: 'number', description: '1-based line number.' },
          character: { type: 'number', description: '1-based character offset.' },
          query: { type: 'string', description: 'Workspace symbol query, only for workspaceSymbol.' },
        },
        required: ['operation', 'filePath'],
      },
    },
    readOnly: true,
  },
  {
    type: 'function',
    function: {
      name: 'lsp_diagnostics',
      description: 'Get project diagnostics. For TypeScript/JavaScript projects this runs the local compiler in no-emit mode and returns compiler diagnostics.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Optional tsconfig path, default tsconfig.json in workspace root.' },
        },
      },
    },
    readOnly: true,
  },
  {
    type: 'function',
    function: {
      name: 'lsp_definition',
      description: 'Find likely definition locations for a symbol using a lightweight workspace index. Use after reading code when you need navigation help.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Function, class, interface, type, const, variable, or enum name.' },
        },
        required: ['symbol'],
      },
    },
    readOnly: true,
  },
  {
    type: 'function',
    function: {
      name: 'lsp_references',
      description: 'Find references for a symbol using a lightweight workspace index. Results include file, line, and code preview.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Symbol name to search for.' },
          limit: { type: 'number', description: 'Maximum number of references. Default 80.' },
        },
        required: ['symbol'],
      },
    },
    readOnly: true,
  },
];

export function createLspToolHandlers(workspaceRoot: string): Record<string, (args: Record<string, unknown>) => Promise<string>> {
  return {
    lsp: args => runLspOperation(workspaceRoot, args),
    lsp_diagnostics: args => getDiagnostics(workspaceRoot, args),
    lsp_definition: args => findDefinitions(workspaceRoot, String(args.symbol || '')),
    lsp_references: args => findReferences(workspaceRoot, String(args.symbol || ''), Number(args.limit || 80)),
  };
}

async function runLspOperation(workspaceRoot: string, args: Record<string, unknown>): Promise<string> {
  const operation = String(args.operation || '');
  const filePath = resolveInside(workspaceRoot, String(args.filePath || '.'));
  const line = Math.max(1, Number(args.line || 1));
  const character = Math.max(1, Number(args.character || 1));
  const uri = pathToFileURL(filePath).href;
  const position = { line: line - 1, character: character - 1 };

  const textDocument = { uri };
  const positionParams = { textDocument, position };
  let method = '';
  let params: unknown = positionParams;

  switch (operation) {
    case 'goToDefinition':
      method = 'textDocument/definition';
      break;
    case 'findReferences':
      method = 'textDocument/references';
      params = { ...positionParams, context: { includeDeclaration: true } };
      break;
    case 'hover':
      method = 'textDocument/hover';
      break;
    case 'documentSymbol':
      method = 'textDocument/documentSymbol';
      params = { textDocument };
      break;
    case 'workspaceSymbol':
      method = 'workspace/symbol';
      params = { query: String(args.query || '') };
      break;
    case 'goToImplementation':
      method = 'textDocument/implementation';
      break;
    case 'prepareCallHierarchy':
      method = 'textDocument/prepareCallHierarchy';
      break;
    case 'incomingCalls':
      method = 'callHierarchy/incomingCalls';
      params = { item: { uri, range: { start: position, end: position }, selectionRange: { start: position, end: position }, name: '', kind: 12 } };
      break;
    case 'outgoingCalls':
      method = 'callHierarchy/outgoingCalls';
      params = { item: { uri, range: { start: position, end: position }, selectionRange: { start: position, end: position }, name: '', kind: 12 } };
      break;
    default:
      return `ERROR: Unsupported LSP operation "${operation}".`;
  }

  try {
    const result = await sendLspRequest<unknown>(workspaceRoot, filePath, method, params);
    if (result === undefined) {
      return `No LSP server available for ${extname(filePath) || 'this file type'}.`;
    }
    return formatLspResult(result, workspaceRoot);
  } catch (err) {
    return `ERROR: LSP ${operation} failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function getDiagnostics(workspaceRoot: string, args: Record<string, unknown>): Promise<string> {
  const project = typeof args.project === 'string' && args.project.trim() ? args.project.trim() : 'tsconfig.json';
  const projectPath = resolveInside(workspaceRoot, project);
  if (!await exists(projectPath)) {
    return `No TypeScript project file found at ${relative(workspaceRoot, projectPath) || project}.`;
  }

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  try {
    const { stdout, stderr } = await execFile(npx, ['tsc', '-p', projectPath, '--noEmit', '--pretty', 'false'], {
      cwd: workspaceRoot,
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 4,
      windowsHide: true,
    });
    const output = [stdout, stderr].filter(Boolean).join('\n').trim();
    return output || 'No diagnostics.';
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const output = [error.stdout, error.stderr].filter(Boolean).join('\n').trim();
    const parsed = parseTscDiagnostics(output || error.message || String(err), workspaceRoot);
    return parsed || output || `ERROR: ${error.message || String(err)}`;
  }
}

async function findDefinitions(workspaceRoot: string, symbol: string): Promise<string> {
  const clean = sanitizeSymbol(symbol);
  if (!clean) return 'ERROR: symbol is required.';

  const declaration = new RegExp(`\\b(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function|class|interface|type|const|let|var|enum)\\s+${escapeRegExp(clean)}\\b`);
  const matches = await scanWorkspace(workspaceRoot, (line) => declaration.test(line), 40);
  return matches.length ? formatMatches(matches) : `No likely definitions found for "${clean}".`;
}

async function findReferences(workspaceRoot: string, symbol: string, limit: number): Promise<string> {
  const clean = sanitizeSymbol(symbol);
  if (!clean) return 'ERROR: symbol is required.';

  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(300, Math.floor(limit))) : 80;
  const word = new RegExp(`\\b${escapeRegExp(clean)}\\b`);
  const matches = await scanWorkspace(workspaceRoot, (line) => word.test(line), safeLimit);
  return matches.length ? formatMatches(matches) : `No references found for "${clean}".`;
}

async function scanWorkspace(
  workspaceRoot: string,
  predicate: (line: string) => boolean,
  limit: number,
): Promise<Array<{ path: string; line: number; text: string }>> {
  const results: Array<{ path: string; line: number; text: string }> = [];

  async function walk(dir: string): Promise<void> {
    if (results.length >= limit) return;
    let entries: Array<import('fs').Dirent>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= limit) return;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(join(dir, entry.name));
        continue;
      }
      if (!TEXT_EXTS.has(extname(entry.name).toLowerCase())) continue;

      const fullPath = join(dir, entry.name);
      let content = '';
      try {
        content = await fs.readFile(fullPath, 'utf8');
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length && results.length < limit; i++) {
        if (predicate(lines[i])) {
          results.push({
            path: relative(workspaceRoot, fullPath).replace(/\\/g, '/'),
            line: i + 1,
            text: lines[i].trim().slice(0, 240),
          });
        }
      }
    }
  }

  await walk(workspaceRoot);
  return results;
}

function parseTscDiagnostics(output: string, workspaceRoot: string): string {
  const lines = output.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return '';
  const severity = DiagnosticSeverity.Error;
  const label = severity === DiagnosticSeverity.Error ? 'error' : 'diagnostic';
  return lines.map(line => line.replace(resolve(workspaceRoot), '.')).map(line => `${label}: ${line}`).join('\n');
}

function formatLspResult(result: unknown, workspaceRoot: string): string {
  if (result == null) return 'No LSP result.';
  const normalizeUri = (uri: string) => {
    try {
      const filePath = uri.startsWith('file:') ? decodeURIComponent(new URL(uri).pathname) : uri;
      const windowsPath = process.platform === 'win32' && /^\/[A-Za-z]:\//.test(filePath)
        ? filePath.slice(1)
        : filePath;
      return relative(workspaceRoot, windowsPath).replace(/\\/g, '/');
    } catch {
      return uri;
    }
  };
  const simplify = (value: any): any => {
    if (Array.isArray(value)) return value.map(simplify);
    if (!value || typeof value !== 'object') return value;
    if (value.uri && value.range) {
      return {
        file: normalizeUri(String(value.uri)),
        range: value.range,
      };
    }
    if (value.targetUri && value.targetRange) {
      return {
        file: normalizeUri(String(value.targetUri)),
        range: value.targetRange,
      };
    }
    if (value.contents) return value.contents;
    if (value.name && value.location?.uri) {
      return {
        name: value.name,
        kind: value.kind,
        file: normalizeUri(String(value.location.uri)),
        range: value.location.range,
      };
    }
    return value;
  };
  return JSON.stringify(simplify(result), null, 2);
}

function formatMatches(matches: Array<{ path: string; line: number; text: string }>): string {
  return matches.map(m => `${m.path}:${m.line}: ${m.text}`).join('\n');
}

function resolveInside(workspaceRoot: string, inputPath: string): string {
  const root = resolve(workspaceRoot);
  const target = resolve(root, inputPath);
  if (target !== root && !target.startsWith(root + '\\') && !target.startsWith(root + '/')) {
    throw new Error(`Path escapes workspace root: ${inputPath}`);
  }
  return target;
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

function sanitizeSymbol(symbol: string): string {
  const trimmed = symbol.trim();
  return /^[A-Za-z_$][\w$]*$/.test(trimmed) ? trimmed : '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
