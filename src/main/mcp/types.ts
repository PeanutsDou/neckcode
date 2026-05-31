/**
 * MCP (Model Context Protocol) types for Neck Code.
 * Supports stdio transport for local MCP server processes.
 */
import type { ToolDefinition } from '../agent/types';

/** stdio MCP server configuration */
export interface McpStdioServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** If true, this server is disabled and won't be connected */
  disabled?: boolean;
}

/** Full MCP configuration file structure */
export interface McpConfig {
  mcpServers: Record<string, McpStdioServerConfig>;
}

/** Connected MCP server state */
export interface ConnectedMcpServer {
  name: string;
  type: 'connected';
  config: McpStdioServerConfig;
  /** Tools fetched from this server, ready for injection into tool registry */
  tools: McpToolDescriptor[];
  /** Cleanup function to disconnect and kill the process */
  cleanup: () => Promise<void>;
}

/** Failed/disabled MCP server */
export interface FailedMcpServer {
  name: string;
  type: 'failed';
  config: McpStdioServerConfig;
  error?: string;
}

export interface DisabledMcpServer {
  name: string;
  type: 'disabled';
  config: McpStdioServerConfig;
}

export type McpServerConnection =
  | ConnectedMcpServer
  | FailedMcpServer
  | DisabledMcpServer;

/** A tool descriptor returned by tools/list from an MCP server */
export interface McpToolDescriptor {
  /** Original name from the server */
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Fully qualified neckcode tool name: mcp__<server>__<tool> */
  qualifiedName: string;
  /** Server name this tool belongs to */
  serverName: string;
}

/** Runtime MCP state held in memory */
export interface McpState {
  connections: McpServerConnection[];
  /** All MCP tools, ready for injection into the agent's tool set */
  tools: McpToolDescriptor[];
  /** Whether MCP subsystem has been initialized */
  initialized: boolean;
}
