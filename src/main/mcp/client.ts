/**
 * MCP client — connects to stdio MCP servers, fetches tools,
 * and provides a call interface for the agent runtime.
 *
 * Architecture (ref: CCbase src/services/mcp/client.ts):
 *   MCP stdio transport -> Client -> tools/list -> Neck Code ToolDefinition[] -> registry
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  McpConfig,
  McpStdioServerConfig,
  McpServerConnection,
  ConnectedMcpServer,
  FailedMcpServer,
  DisabledMcpServer,
  McpToolDescriptor,
  McpState,
} from './types';
import type { ToolDefinition } from '../agent/types';

// ── State ────────────────────────────────────────────────────

const state: McpState = {
  connections: [],
  tools: [],
  initialized: false,
};

export function getMcpState(): Readonly<McpState> {
  return state;
}

/** All MCP tool definitions (OpenAI function-calling format) for injection into ToolRegistry */
export function getMcpToolDefinitions(): ToolDefinition[] {
  return state.tools.map(td => mcpToolToDefinition(td));
}

/** Find the owning server for a given mcp__ prefixed tool name */
export function resolveMcpTool(qualifiedName: string): { server: ConnectedMcpServer; tool: McpToolDescriptor } | null {
  const tool = state.tools.find(t => t.qualifiedName === qualifiedName);
  if (!tool) return null;
  const conn = state.connections.find(c => c.name === tool.serverName && c.type === 'connected') as ConnectedMcpServer | undefined;
  if (!conn) return null;
  return { server: conn, tool };
}

// ── Tool conversion ───────────────────────────────────────────

function mcpToolToDefinition(td: McpToolDescriptor): ToolDefinition {
  // Normalize input schema to OpenAI function-calling parameters format
  const parameters: Record<string, unknown> = {
    type: 'object',
    properties: (td.inputSchema?.properties as Record<string, unknown>) || {},
    ...(td.inputSchema?.required ? { required: td.inputSchema.required } : {}),
  };

  return {
    type: 'function',
    function: {
      name: td.qualifiedName,
      description: `[MCP:${td.serverName}] ${td.description || td.name}`,
      parameters,
    },
    readOnly: false, // MCP tools are conservatively treated as non-readOnly
  };
}

// ── Connection management ─────────────────────────────────────

/**
 * Connect to a single MCP server via stdio.
 * Returns a connection object (connected on success, failed on error).
 */
async function connectToOne(name: string, config: McpStdioServerConfig): Promise<McpServerConnection> {
  if (config.disabled) {
    return { name, type: 'disabled', config };
  }

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args || [],
    env: config.env as Record<string, string> | undefined,
    stderr: 'pipe',
  });

  const client = new Client(
    {
      name: 'neckcode',
      title: 'Neck Code',
      version: '0.4.0',
    },
    {
      capabilities: {},
    },
  );

  // Capture stderr for debugging
  let stderrBuf = '';
  if (transport.stderr) {
    transport.stderr.on('data', (data: Buffer) => {
      if (stderrBuf.length < 64 * 1024) {
        stderrBuf += data.toString();
      }
    });
  }

  try {
    await client.connect(transport);
    console.log(`[MCP] Connected to "${name}"`);

    // Fetch tools
    const toolsResult = await client.request(
      { method: 'tools/list' },
      ListToolsResultSchema,
    );

    const tools: McpToolDescriptor[] = (toolsResult.tools || []).map(tool => {
      const originalName = tool.name;
      // Sanitize: replace chars that break OpenAI function names
      const safeServerName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeToolName = originalName.replace(/[^a-zA-Z0-9_-]/g, '_');
      return {
        name: originalName,
        description: tool.description || '',
        inputSchema: (tool.inputSchema || { type: 'object', properties: {} }) as Record<string, unknown>,
        qualifiedName: `mcp__${safeServerName}__${safeToolName}`,
        serverName: name,
      };
    });

    console.log(`[MCP] "${name}" provides ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);

    const cleanup = async () => {
      try {
        await client.close();
      } catch {
        // Best effort
      }
      if (stderrBuf) {
        console.error(`[MCP] "${name}" stderr:\n${stderrBuf.slice(0, 2000)}`);
      }
    };

    return {
      name,
      type: 'connected',
      config,
      tools,
      cleanup,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[MCP] Failed to connect "${name}": ${errorMsg}`);
    if (stderrBuf) {
      console.error(`[MCP] "${name}" stderr:\n${stderrBuf.slice(0, 2000)}`);
    }
    try { await client.close(); } catch { /* ignore */ }
    return { name, type: 'failed', config, error: errorMsg };
  }
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Initialize all MCP servers from config.
 * Call once on app startup. Idempotent.
 */
export async function initMcpClient(mcpConfig: McpConfig): Promise<void> {
  if (state.initialized) {
    console.warn('[MCP] Already initialized, shutting down previous connections first');
    await shutdownMcpClient();
  }

  const entries = Object.entries(mcpConfig.mcpServers);
  if (entries.length === 0) {
    console.log('[MCP] No MCP servers configured, skipping init');
    state.initialized = true;
    return;
  }

  console.log(`[MCP] Initializing ${entries.length} server(s)...`);

  // Connect to all servers in parallel
  const results = await Promise.allSettled(
    entries.map(([name, cfg]) => connectToOne(name, cfg)),
  );

  const connections: McpServerConnection[] = [];
  const allTools: McpToolDescriptor[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const conn = result.value;
      connections.push(conn);
      if (conn.type === 'connected') {
        allTools.push(...conn.tools);
      }
    }
  }

  state.connections = connections;
  state.tools = allTools;
  state.initialized = true;

  const connected = connections.filter(c => c.type === 'connected').length;
  const failed = connections.filter(c => c.type === 'failed').length;
  const disabled = connections.filter(c => c.type === 'disabled').length;
  console.log(`[MCP] Init complete: ${connected} connected, ${failed} failed, ${disabled} disabled, ${allTools.length} tools total`);
}

/**
 * Shut down all MCP connections gracefully.
 */
export async function shutdownMcpClient(): Promise<void> {
  for (const conn of state.connections) {
    if (conn.type === 'connected') {
      try {
        await conn.cleanup();
      } catch {
        // Best effort
      }
    }
  }
  state.connections = [];
  state.tools = [];
  state.initialized = false;
}

/**
 * Execute an MCP tool call by its qualified name.
 * @returns The tool result as a string (or JSON for structured content).
 */
export async function callMcpTool(
  qualifiedName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const resolved = resolveMcpTool(qualifiedName);
  if (!resolved) {
    return `ERROR: MCP tool "${qualifiedName}" not found or server not connected`;
  }

  const { server, tool } = resolved;

  try {
    // Need to get a fresh client reference — but our ConnectedMcpServer stores
    // the cleanup function, not the client. We reconnect if necessary.
    const client = new Client(
      { name: 'neckcode', title: 'Neck Code', version: '0.4.0' },
      { capabilities: {} },
    );

    const transport = new StdioClientTransport({
      command: server.config.command,
      args: server.config.args || [],
      env: server.config.env as Record<string, string> | undefined,
      stderr: 'pipe',
    });

    try {
      await client.connect(transport);
      const result = await client.callTool(
        { name: tool.name, arguments: args },
        CallToolResultSchema,
        { timeout: 60000 },
      );

      // Extract content from result
      if (result.isError) {
        const errorText = Array.isArray(result.content)
          ? result.content.map((c: any) => c.text || '').join('\n')
          : 'Unknown error';
        return `ERROR from MCP server "${server.name}": ${errorText}`;
      }

      // Collect text content
      const texts: string[] = [];
      if (Array.isArray(result.content)) {
        for (const block of result.content) {
          if (block && typeof block === 'object') {
            if ('text' in block && typeof block.text === 'string') {
              texts.push(block.text);
            } else if ('type' in block && block.type === 'image') {
              texts.push(`[Image: ${(block as any).mimeType || 'unknown'}]`);
            } else if ('type' in block && block.type === 'resource') {
              const res = block as any;
              if (res.resource?.text) {
                texts.push(res.resource.text);
              } else {
                texts.push(`[Resource: ${res.resource?.uri || 'unknown'}]`);
              }
            }
          }
        }
      }

      // Also check structuredContent
      if (result.structuredContent && texts.length === 0) {
        return JSON.stringify(result.structuredContent, null, 2);
      }

      return texts.join('\n') || '[empty result]';
    } finally {
      await client.close().catch(() => {});
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return `ERROR calling MCP tool "${qualifiedName}" on server "${server.name}": ${errorMsg}`;
  }
}
