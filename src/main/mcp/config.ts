/**
 * MCP configuration loader.
 * Reads from ~/.neckcode/mcp.json, creates default if missing.
 */
import { promises as fs } from 'fs';
import { join } from 'path';
import { userDataDir } from '../app-paths';
import type { McpConfig, McpStdioServerConfig } from './types';

const CONFIG_FILE_NAME = 'mcp.json';

export function getMcpConfigPath(): string {
  return join(userDataDir(), CONFIG_FILE_NAME);
}

const DEFAULT_MCP_CONFIG: McpConfig = {
  mcpServers: {},
};

/** Load MCP config from disk, creating a default if none exists */
export async function loadMcpConfig(): Promise<McpConfig> {
  const configPath = getMcpConfigPath();
  try {
    await fs.mkdir(userDataDir(), { recursive: true });
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as McpConfig;
    if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
      return { mcpServers: {} };
    }
    // Validate and clean each server entry
    const servers: Record<string, McpStdioServerConfig> = {};
    for (const [name, cfg] of Object.entries(parsed.mcpServers)) {
      if (!cfg || typeof cfg !== 'object') continue;
      if (typeof cfg.command !== 'string' || !cfg.command.trim()) continue;
      servers[name] = {
        command: cfg.command.trim(),
        args: Array.isArray(cfg.args)
          ? cfg.args.filter((a: unknown): a is string => typeof a === 'string')
          : [],
        env: cfg.env && typeof cfg.env === 'object'
          ? Object.fromEntries(
              Object.entries(cfg.env).filter(
                ([, v]) => typeof v === 'string'
              )
            )
          : undefined,
        disabled: cfg.disabled === true,
      };
    }
    return { mcpServers: servers };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // Create default config
      await saveMcpConfig(DEFAULT_MCP_CONFIG);
      return { ...DEFAULT_MCP_CONFIG };
    }
    console.error('[MCP] Failed to load MCP config:', err);
    return { mcpServers: {} };
  }
}

/** Save MCP config to disk */
export async function saveMcpConfig(config: McpConfig): Promise<void> {
  const configPath = getMcpConfigPath();
  try {
    await fs.mkdir(userDataDir(), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[MCP] Failed to save MCP config:', err);
  }
}
