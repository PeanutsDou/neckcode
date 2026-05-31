import { promises as fs } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { extname, basename } from 'path';
import { pathToFileURL } from 'url';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node.js';
import type { InitializeParams } from 'vscode-languageserver-protocol';

interface LspServerConfig {
  name: string;
  command: string;
  args: string[];
  extensions: string[];
}

interface LspServer {
  config: LspServerConfig;
  process: ChildProcess;
  connection: MessageConnection;
  openedFiles: Set<string>;
}

const serverConfigs: LspServerConfig[] = [
  {
    name: 'typescript',
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['typescript-language-server', '--stdio'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  },
  {
    name: 'pyright',
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['pyright-langserver', '--stdio'],
    extensions: ['.py'],
  },
  {
    name: 'rust-analyzer',
    command: 'rust-analyzer',
    args: [],
    extensions: ['.rs'],
  },
  {
    name: 'gopls',
    command: 'gopls',
    args: [],
    extensions: ['.go'],
  },
];

const servers = new Map<string, LspServer>();

export async function shutdownLspServers(): Promise<void> {
  for (const server of servers.values()) {
    try {
      await server.connection.sendRequest('shutdown');
      server.connection.sendNotification('exit');
    } catch {
      // Best effort.
    }
    server.connection.dispose();
    server.process.kill();
  }
  servers.clear();
}

export async function sendLspRequest<T>(
  workspaceRoot: string,
  filePath: string,
  method: string,
  params: unknown,
): Promise<T | undefined> {
  const server = await getServer(workspaceRoot, filePath);
  if (!server) return undefined;
  await openFileIfNeeded(server, filePath);
  return server.connection.sendRequest<T>(method, params);
}

async function getServer(workspaceRoot: string, filePath: string): Promise<LspServer | undefined> {
  const ext = extname(filePath).toLowerCase();
  const config = serverConfigs.find(item => item.extensions.includes(ext));
  if (!config) return undefined;

  const existing = servers.get(config.name);
  if (existing) return existing;

  const child = spawn(config.command, config.args, {
    cwd: workspaceRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });

  if (!child.stdout || !child.stdin) {
    throw new Error(`LSP server ${config.name} stdio unavailable`);
  }

  child.stderr?.on('data', data => {
    const text = data.toString().trim();
    if (text) console.warn(`[LSP:${config.name}] ${text.slice(0, 1000)}`);
  });

  const connection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  connection.onError(([error]) => console.warn(`[LSP:${config.name}] ${error.message}`));
  connection.listen();

  const rootUri = pathToFileURL(workspaceRoot).href;
  const initParams: InitializeParams = {
    processId: process.pid,
    rootUri,
    rootPath: workspaceRoot,
    workspaceFolders: [{ uri: rootUri, name: basename(workspaceRoot) }],
    capabilities: {
      workspace: { configuration: false, workspaceFolders: false },
      textDocument: {
        synchronization: { dynamicRegistration: false, didSave: true },
        hover: { dynamicRegistration: false, contentFormat: ['markdown', 'plaintext'] },
        definition: { dynamicRegistration: false, linkSupport: true },
        references: { dynamicRegistration: false },
        documentSymbol: { dynamicRegistration: false, hierarchicalDocumentSymbolSupport: true },
        implementation: { dynamicRegistration: false, linkSupport: true },
        callHierarchy: { dynamicRegistration: false },
      },
    },
  };

  await connection.sendRequest('initialize', initParams);
  connection.sendNotification('initialized', {});

  const server: LspServer = { config, process: child, connection, openedFiles: new Set() };
  servers.set(config.name, server);
  return server;
}

async function openFileIfNeeded(server: LspServer, filePath: string): Promise<void> {
  const uri = pathToFileURL(filePath).href;
  if (server.openedFiles.has(uri)) return;
  const text = await fs.readFile(filePath, 'utf8');
  server.connection.sendNotification('textDocument/didOpen', {
    textDocument: {
      uri,
      languageId: languageIdForExtension(extname(filePath).toLowerCase()),
      version: 1,
      text,
    },
  });
  server.openedFiles.add(uri);
}

function languageIdForExtension(ext: string): string {
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') return 'javascript';
  if (ext === '.py') return 'python';
  if (ext === '.rs') return 'rust';
  if (ext === '.go') return 'go';
  return ext.replace(/^\./, '') || 'plaintext';
}
