import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { encrypt, decrypt } from './config/secrets';
import type { PermissionMode } from '../shared/permissions';
import type { AgentConfig } from '../shared/types';
import { ensureUserDataDirMigrated, userDataDir } from './app-paths';

export type ModelMode = 'text' | 'multimodal';

export interface ModelConfig {
  name: string;
  contextLimit?: number;
  maxTokens?: number;
  mode?: ModelMode;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ModelConfig[];
}

export interface AppConfigData {
  providers: ProviderConfig[];
  activeProvider: string;
  activeModel: string;
  agent: {
    maxTurns: number;
    maxTokens: number;       // fallback max output tokens
    contextLimit: number;    // fallback context window
    workspaceRoot: string;
  };
  systemPrompt: string;
  permissionMode: PermissionMode;
  theme?: 'light' | 'dark';
  lightScheme?: string;
  closeBehavior?: 'ask' | 'tray' | 'quit';
  autoLaunch?: boolean;
  alwaysOnTop?: boolean;
  fontScale?: number;
  codeLeftWidth?: number;
  lastSeenReleaseNotesVersion?: string;
  imAgent?: {
    enabled: boolean;
    autoReplyWhenAway: boolean;
    allowSessionList: boolean;
    allowSessionPreview: boolean;
  };
  window?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  quickLauncher?: {
    enabled: boolean;
    triggerWindowMs: number;
    inputAutoHideMs: number;
    panelAutoHideMs: number;
    mode: 'chat' | 'find';
    modelId?: string;
    position?: { x: number; y: number };
    findMaxDepth?: number;
    favorites?: string[];
  };
  agents: AgentConfig[];
}

const CONFIG_DIR = userDataDir();
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const CONFIG_BAK_FILE = join(CONFIG_DIR, 'config.json.bak');
const CONFIG_TMP_FILE = join(CONFIG_DIR, 'config.json.tmp');

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    models: [
      { name: 'deepseek-v4-pro', contextLimit: 1000000, maxTokens: 32768, mode: 'text' },
      { name: 'deepseek-v4-flash', contextLimit: 1000000, maxTokens: 16384, mode: 'text' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: '',
    models: [
      { name: 'claude-sonnet-4-6', contextLimit: 200000, maxTokens: 32768, mode: 'multimodal' },
      { name: 'claude-haiku-4-5', contextLimit: 200000, maxTokens: 16384, mode: 'multimodal' },
    ],
  },
];

const defaultConfig: AppConfigData = {
  providers: DEFAULT_PROVIDERS,
  activeProvider: 'deepseek',
  activeModel: 'deepseek-v4-pro',
  agent: {
    maxTurns: 100,
    maxTokens: 32768,
    contextLimit: 0,
    workspaceRoot: homedir(),
  },
  systemPrompt: 'You are Neck Code, a helpful coding assistant. Use tools when needed. Be concise and factual.',
  permissionMode: 'default',
  theme: 'light',
  lightScheme: 'default',
  autoLaunch: false,
  quickLauncher: {
    enabled: true,
    triggerWindowMs: 400,
    inputAutoHideMs: 5000,
    panelAutoHideMs: 10000,
    mode: 'chat',
    modelId: 'deepseek-v4-flash',
    position: undefined,
    findMaxDepth: 4,
    favorites: [],
  },
  imAgent: {
    enabled: false,
    autoReplyWhenAway: false,
    allowSessionList: true,
    allowSessionPreview: false,
  },
  agents: [],
};

let config: AppConfigData = cloneDefaultConfig();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneProvider(provider: ProviderConfig): ProviderConfig {
  return {
    ...provider,
    models: provider.models.map(model => ({ ...model })),
  };
}

function cloneDefaultConfig(): AppConfigData {
  return {
    ...defaultConfig,
    providers: DEFAULT_PROVIDERS.map(cloneProvider),
    agent: { ...defaultConfig.agent },
    window: defaultConfig.window ? { ...defaultConfig.window } : undefined,
    quickLauncher: defaultConfig.quickLauncher ? { ...defaultConfig.quickLauncher } : undefined,
    imAgent: defaultConfig.imAgent ? { ...defaultConfig.imAgent } : undefined,
    agents: defaultConfig.agents.map(agent => ({ ...agent, skills: [...agent.skills] })),
  };
}

function normalizePermissionMode(value: unknown): PermissionMode {
  return value === 'fullAccess' ? 'fullAccess' : 'default';
}

function normalizeAgents(raw: unknown): AgentConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a: unknown): a is AgentConfig =>
    typeof a === 'object' && a !== null &&
    typeof (a as Record<string,unknown>).id === 'string' &&
    typeof (a as Record<string,unknown>).name === 'string'
  );
}

export function inferModelMode(modelName: string): ModelMode {
  const name = modelName.toLowerCase();
  const multimodalPatterns = [
    'vision',
    'multimodal',
    'omni',
    'gpt-4o',
    'gpt-4.1',
    'gpt-5',
    'gemini',
    'qwen-vl',
    'qwen2-vl',
    'qwen2.5-vl',
    'qwen-omni',
    'vl',
    'claude-3',
    'claude-sonnet-4',
    'claude-haiku-4',
    'claude-opus-4',
  ];
  return multimodalPatterns.some(pattern => name.includes(pattern)) ? 'multimodal' : 'text';
}

function normalizeModels(raw: unknown): ModelConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m: unknown): ModelConfig | null => {
      if (typeof m === 'string') return { name: m, mode: inferModelMode(m) };
      if (typeof m === 'object' && m !== null && typeof (m as Record<string, unknown>).name === 'string') {
        const o = m as Record<string, unknown>;
        const name = o.name as string;
        const rawMode = o.mode;
        return {
          name,
          contextLimit: typeof o.contextLimit === 'number' ? o.contextLimit : undefined,
          maxTokens: typeof o.maxTokens === 'number' ? o.maxTokens : undefined,
          mode: rawMode === 'text' || rawMode === 'multimodal' ? rawMode : inferModelMode(name),
        };
      }
      return null;
    })
    .filter((m): m is ModelConfig => m !== null);
}

function normalizeProvider(raw: unknown): ProviderConfig | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : '';
  if (!id || !name || !baseUrl) return null;
  return {
    id,
    name,
    baseUrl,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    models: normalizeModels(raw.models),
  };
}

function normalizeLoadedConfig(loaded: AppConfigData): AppConfigData {
  loaded.providers = Array.isArray(loaded.providers)
    ? loaded.providers.map(normalizeProvider).filter((p): p is ProviderConfig => p !== null)
    : [];
  if (!Array.isArray(loaded.providers) || loaded.providers.length === 0) {
    loaded.providers = DEFAULT_PROVIDERS.map(cloneProvider);
  }
  loaded.permissionMode = normalizePermissionMode(loaded.permissionMode);
  loaded.autoLaunch = typeof loaded.autoLaunch === 'boolean' ? loaded.autoLaunch : defaultConfig.autoLaunch;
  loaded.agents = normalizeAgents(loaded.agents);
  const rawImAgent: Record<string, unknown> = isRecord(loaded.imAgent) ? loaded.imAgent : {};
  loaded.imAgent = {
    enabled: rawImAgent.enabled === true,
    autoReplyWhenAway: rawImAgent.autoReplyWhenAway === true,
    allowSessionList: rawImAgent.allowSessionList !== false,
    allowSessionPreview: rawImAgent.allowSessionPreview === true,
  };
  const rawQuickLauncher: Record<string, unknown> = isRecord(loaded.quickLauncher) ? loaded.quickLauncher : {};
  loaded.quickLauncher = {
    enabled: typeof rawQuickLauncher.enabled === 'boolean' ? rawQuickLauncher.enabled : defaultConfig.quickLauncher!.enabled,
    triggerWindowMs: typeof rawQuickLauncher.triggerWindowMs === 'number'
      ? Math.max(150, Math.min(1200, rawQuickLauncher.triggerWindowMs))
      : defaultConfig.quickLauncher!.triggerWindowMs,
    inputAutoHideMs: typeof rawQuickLauncher.inputAutoHideMs === 'number'
      ? Math.max(1000, Math.min(60000, rawQuickLauncher.inputAutoHideMs))
      : defaultConfig.quickLauncher!.inputAutoHideMs,
    panelAutoHideMs: typeof rawQuickLauncher.panelAutoHideMs === 'number'
      ? Math.max(1000, Math.min(120000, rawQuickLauncher.panelAutoHideMs))
      : defaultConfig.quickLauncher!.panelAutoHideMs,
    mode: rawQuickLauncher.mode === 'find' ? 'find' : 'chat',
    modelId: typeof rawQuickLauncher.modelId === 'string'
      && loaded.providers.some(p => p.models.some(m => m.name === rawQuickLauncher.modelId))
      ? rawQuickLauncher.modelId
      : loaded.providers.some(p => p.models.some(m => m.name === defaultConfig.quickLauncher!.modelId))
        ? defaultConfig.quickLauncher!.modelId
        : loaded.activeModel,
    position: isRecord(rawQuickLauncher.position)
      && typeof rawQuickLauncher.position.x === 'number'
      && typeof rawQuickLauncher.position.y === 'number'
      ? { x: rawQuickLauncher.position.x, y: rawQuickLauncher.position.y }
      : undefined,
    findMaxDepth: typeof rawQuickLauncher.findMaxDepth === 'number'
      ? Math.max(1, Math.min(8, rawQuickLauncher.findMaxDepth))
      : defaultConfig.quickLauncher!.findMaxDepth,
  };

  const providerForActiveModel = loaded.providers.find(p => p.models.some(m => m.name === loaded.activeModel));
  if (!loaded.providers.some(p => p.id === loaded.activeProvider)) {
    loaded.activeProvider = providerForActiveModel?.id || loaded.providers[0]?.id || defaultConfig.activeProvider;
  }
  if (!loaded.activeModel || !loaded.providers.some(p => p.models.some(m => m.name === loaded.activeModel))) {
    loaded.activeModel = loaded.providers.find(p => p.id === loaded.activeProvider)?.models[0]?.name
      || loaded.providers[0]?.models[0]?.name
      || defaultConfig.activeModel;
  }
  return loaded;
}

function stripRemovedConfigKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...raw };
  delete cleaned.vision;
  return cleaned;
}

export function getConfig(): AppConfigData {
  return config;
}

export function setConfig(partial: Partial<AppConfigData>): void {
  config = { ...config, ...partial };
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

/** All model names across all providers (flat list for dropdown). */
export function getAllModelNames(): string[] {
  return config.providers.flatMap(p => p.models.map(m => m.name));
}

/** Look up per-model config. Falls back to agent-level defaults. */
export function getModelConfig(modelName: string): ModelConfig | undefined {
  for (const p of config.providers) {
    const found = p.models.find(m => m.name === modelName);
    if (found) return found;
  }
  return undefined;
}

export function getActiveProvider(): ProviderConfig {
  return config.providers.find(p => p.id === config.activeProvider) || config.providers[0];
}

export function getAgents(): AgentConfig[] {
  return config.agents;
}

export function saveAgent(agent: AgentConfig): void {
  const idx = config.agents.findIndex(a => a.id === agent.id);
  if (idx >= 0) {
    config.agents[idx] = agent;
  } else {
    config.agents.push(agent);
  }
}

export function deleteAgent(agentId: string): void {
  config.agents = config.agents.filter(a => a.id !== agentId);
}

function migrateLegacy(raw: Record<string, unknown>): AppConfigData {
  const cleanedRaw = stripRemovedConfigKeys(raw);
  if (Array.isArray(raw.providers)) {
    const providers = raw.providers
      .map(normalizeProvider)
      .filter((p): p is ProviderConfig => p !== null);
    return normalizeLoadedConfig({
      ...cloneDefaultConfig(),
      ...cleanedRaw,
      providers: providers.length > 0 ? providers : DEFAULT_PROVIDERS.map(cloneProvider),
      agent: { ...defaultConfig.agent, ...(isRecord(cleanedRaw.agent) ? cleanedRaw.agent : {}) },
    } as AppConfigData);
  }

  // Migrate from old deepseek/anthropic format
  const providers: ProviderConfig[] = DEFAULT_PROVIDERS.map(cloneProvider);
  const ds = raw.deepseek as Record<string, unknown> | undefined;
  const ant = raw.anthropic as Record<string, unknown> | undefined;

  if (ds) {
    const p = providers.find(x => x.id === 'deepseek')!;
    if (typeof ds.baseUrl === 'string') p.baseUrl = ds.baseUrl;
    if (typeof ds.apiKey === 'string') p.apiKey = ds.apiKey;
    if (Array.isArray(ds.models)) p.models = normalizeModels(ds.models);
  }
  if (ant) {
    const p = providers.find(x => x.id === 'anthropic')!;
    if (typeof ant.apiKey === 'string') p.apiKey = ant.apiKey;
    if (Array.isArray(ant.models)) p.models = normalizeModels(ant.models);
  }

  return normalizeLoadedConfig({
    ...cloneDefaultConfig(),
    ...cleanedRaw,
    providers,
    activeModel: (cleanedRaw.activeModel as string) || defaultConfig.activeModel,
    agent: { ...defaultConfig.agent, ...(isRecord(cleanedRaw.agent) ? cleanedRaw.agent : {}) },
    deepseek: undefined,
    anthropic: undefined,
  } as unknown as AppConfigData);
}

async function isReadableConfig(filePath: string): Promise<boolean> {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
    if (!isRecord(raw)) return false;
    if (Array.isArray(raw.providers)) return raw.providers.some(p => normalizeProvider(p) !== null);
    return true;
  } catch {
    return false;
  }
}

async function tryLoadFromFile(filePath: string): Promise<AppConfigData | null> {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const raw = JSON.parse(data) as Record<string, unknown>;
    const loaded = migrateLegacy(raw);
    for (const p of loaded.providers) {
      if (!p.apiKey) continue;
      try {
        p.apiKey = await decrypt(p.apiKey);
      } catch (err) {
        console.error(`Failed to decrypt API key for provider "${p.id}", keeping stored value:`, err);
      }
    }
    return loaded;
  } catch {
    return null;
  }
}

export async function loadConfig(): Promise<AppConfigData> {
  await ensureUserDataDirMigrated();
  await fs.mkdir(CONFIG_DIR, { recursive: true });

  // 1. Try primary config
  const primary = await tryLoadFromFile(CONFIG_FILE);
  if (primary) {
    config = primary;
    return config;
  }

  // 2. Try backup
  const backup = await tryLoadFromFile(CONFIG_BAK_FILE);
  if (backup) {
    console.warn('Primary config corrupted or missing, restored from backup.');
    config = backup;
    // Restore primary from backup immediately
    await saveConfig();
    return config;
  }

  // 3. First-time setup — create fresh config
  config = cloneDefaultConfig();
  await saveConfig();
  return config;
}

export async function saveConfig(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    config = normalizeLoadedConfig(config);
    const toSave = { ...config, providers: await Promise.all(config.providers.map(async p => ({
      ...p,
      apiKey: p.apiKey ? await encrypt(p.apiKey) : '',
    }))) };
    const serialized = JSON.stringify(toSave, null, 2);
    JSON.parse(serialized);
    await fs.writeFile(CONFIG_TMP_FILE, serialized, 'utf8');
    if (await isReadableConfig(CONFIG_FILE)) {
      try { await fs.copyFile(CONFIG_FILE, CONFIG_BAK_FILE); } catch {}
    }
    try {
      await fs.rename(CONFIG_TMP_FILE, CONFIG_FILE);
    } catch {
      await fs.copyFile(CONFIG_TMP_FILE, CONFIG_FILE);
      await fs.rm(CONFIG_TMP_FILE, { force: true });
    }
  } catch (err) {
    console.error('Failed to save config:', err);
    try { await fs.rm(CONFIG_TMP_FILE, { force: true }); } catch {}
  }
}
