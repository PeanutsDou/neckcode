import { promises as fs } from 'fs';
import { join } from 'path';

export interface AppConfigData {
  deepseek: {
    baseUrl: string;
    apiKey: string;
    models: string[];
  };
  anthropic: {
    apiKey: string;
    models: string[];
  };
  agent: {
    maxTurns: number;
    workspaceRoot: string;
  };
  systemPrompt: string;
  activeModel: string;
  window?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
}

const CONFIG_DIR = join(process.cwd(), '.deepseekcode');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const defaultConfig: AppConfigData = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  },
  anthropic: {
    apiKey: '',
    models: ['claude-sonnet-4-6', 'claude-haiku-4-5'],
  },
  agent: {
    maxTurns: 8,
    workspaceRoot: process.cwd(),
  },
  systemPrompt:
    'You are a helpful coding assistant. Use tools when needed. Be concise and factual.',
  activeModel: 'deepseek-v4-pro',
};

let config: AppConfigData = { ...defaultConfig };

export function getConfig(): AppConfigData {
  return config;
}

export function setConfig(partial: Partial<AppConfigData>): void {
  config = { ...config, ...partial };
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export async function loadConfig(): Promise<AppConfigData> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const loaded = JSON.parse(data) as Partial<AppConfigData>;
    config = { ...defaultConfig, ...loaded };
  } catch {
    // File doesn't exist or is corrupt, use defaults
    config = { ...defaultConfig };
    await saveConfig();
  }
  return config;
}

export async function saveConfig(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}
