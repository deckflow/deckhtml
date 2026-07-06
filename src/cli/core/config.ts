/**
 * Persistent CLI configuration at ~/.deckflow/credentials
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface DeckhtmlConfigData {
  apiKey?: string;
  token?: string;
  spaceId?: string;
  apiBase?: string;
  webhook?: string;
  retentionHours?: number;
}

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.deckflow');
const CONFIG_FILE = 'credentials';
const DEFAULT_API_BASE = 'https://app.deckflow.com/v1';
const DEFAULT_RETENTION_HOURS = 3;

const CONFIG_KEYS: (keyof DeckhtmlConfigData)[] = [
  'apiKey',
  'token',
  'spaceId',
  'apiBase',
  'webhook',
  'retentionHours',
];

function sanitizeConfig(raw: Record<string, unknown>): DeckhtmlConfigData {
  const data: DeckhtmlConfigData = {};
  for (const key of CONFIG_KEYS) {
    const value = raw[key];
    if (value !== undefined) {
      (data as Record<string, unknown>)[key] = value;
    }
  }
  return data;
}

function hasLegacyKeys(raw: Record<string, unknown>): boolean {
  return Object.keys(raw).some(
    (key) => !CONFIG_KEYS.includes(key as keyof DeckhtmlConfigData)
  );
}

export class Config {
  private readonly configDir: string;
  private readonly configPath: string;
  private data: DeckhtmlConfigData = {};

  constructor(configDir?: string) {
    this.configDir =
      configDir || process.env.DECKHTML_CONFIG_DIR || DEFAULT_CONFIG_DIR;
    this.configPath = path.join(this.configDir, CONFIG_FILE);
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      this.data = sanitizeConfig(parsed);
      if (hasLegacyKeys(parsed)) {
        await this.save();
      }
    } catch {
      this.data = {};
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    await fs.writeFile(
      this.configPath,
      `${JSON.stringify(this.data, null, 2)}\n`,
      'utf-8'
    );
  }

  get<K extends keyof DeckhtmlConfigData>(
    key: K,
    defaultValue?: DeckhtmlConfigData[K]
  ): DeckhtmlConfigData[K] | undefined {
    return this.data[key] ?? defaultValue;
  }

  async set<K extends keyof DeckhtmlConfigData>(
    key: K,
    value: DeckhtmlConfigData[K]
  ): Promise<void> {
    this.data[key] = value;
    await this.save();
  }

  all(): DeckhtmlConfigData {
    return sanitizeConfig(this.data as Record<string, unknown>);
  }

  get apiBase(): string {
    return this.data.apiBase || DEFAULT_API_BASE;
  }

  get retentionHours(): number {
    return this.data.retentionHours ?? DEFAULT_RETENTION_HOURS;
  }

  async setApiKey(value: string): Promise<void> {
    this.data.apiKey = value;
    await this.save();
  }

  async setToken(value: string): Promise<void> {
    this.data.token = value;
    await this.save();
  }

  async setSpaceId(value: string): Promise<void> {
    this.data.spaceId = value;
    await this.save();
  }

  isConfigured(): boolean {
    return Boolean(this.data.apiKey || this.data.token);
  }

  get configFilePath(): string {
    return this.configPath;
  }
}
